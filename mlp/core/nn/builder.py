"""Architecture JSON -> torch.nn.Module.

kinds: mlp | cnn1d | cnn2d | ft_transformer | gcn
Layer types for mlp/cnn: dense{units,activation,dropout,batchnorm}, conv{filters,kernel,activation,pool,batchnorm}
"""
from __future__ import annotations

import math

import torch
from torch import nn

ACTIVATIONS = {
    "relu": nn.ReLU, "gelu": nn.GELU, "tanh": nn.Tanh, "sigmoid": nn.Sigmoid, "leaky_relu": nn.LeakyReLU,
    "elu": nn.ELU, "silu": nn.SiLU, "none": nn.Identity,
}


def act(name: str) -> nn.Module:
    return ACTIVATIONS.get(name or "relu", nn.ReLU)()


class Reshape(nn.Module):
    def __init__(self, *shape):
        super().__init__()
        self.shape = shape

    def forward(self, x):
        return x.reshape(x.shape[0], *self.shape)


class FTTransformer(nn.Module):
    def __init__(self, n_features: int, n_out: int, d_token=32, n_blocks=2, n_heads=4, ffn_mult=2, dropout=0.1):
        super().__init__()
        n_heads = max(1, int(n_heads))
        d_token = max(n_heads, int(d_token) // n_heads * n_heads)
        self.weight = nn.Parameter(torch.randn(n_features, d_token) / math.sqrt(d_token))
        self.bias = nn.Parameter(torch.zeros(n_features, d_token))
        self.cls = nn.Parameter(torch.randn(1, 1, d_token) * 0.02)
        layer = nn.TransformerEncoderLayer(d_token, n_heads, dim_feedforward=int(d_token * ffn_mult), dropout=float(dropout),
                                           batch_first=True, activation="gelu", norm_first=True)
        self.encoder = nn.TransformerEncoder(layer, num_layers=max(1, int(n_blocks)), enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d_token)
        self.head = nn.Linear(d_token, n_out)

    def forward(self, x):
        tok = x.unsqueeze(-1) * self.weight + self.bias
        tok = torch.cat([self.cls.expand(x.shape[0], -1, -1), tok], dim=1)
        h = self.encoder(tok)
        return self.head(self.norm(h[:, 0]))


def _sequential(arch: dict, n_features: int, n_out: int, image_shape=None):
    kind = arch.get("kind", "mlp")
    layers = arch.get("layers") or []
    mods: list[tuple[str, nn.Module]] = []
    if kind == "mlp":
        width = n_features
        for i, L in enumerate(l for l in layers if l.get("type", "dense") == "dense"):
            u = max(1, int(L.get("units", 32)))
            block = [nn.Linear(width, u)]
            if L.get("batchnorm"):
                block.append(nn.BatchNorm1d(u))
            block.append(act(L.get("activation")))
            if float(L.get("dropout") or 0) > 0:
                block.append(nn.Dropout(float(L["dropout"])))
            mods.append((f"dense{i + 1}", nn.Sequential(*block)))
            width = u
        mods.append(("output", nn.Linear(width, n_out)))
        return nn.Sequential(*[m for _, m in mods]), [n for n, _ in mods]

    two_d = kind == "cnn2d"
    if two_d:
        if not image_shape:
            raise ValueError("The image CNN needs image data (an image dataset, or the handwritten digits sample).")
        c, h, w = (1, int(image_shape[0]), int(image_shape[1])) if len(image_shape) == 2 else (int(image_shape[0]), int(image_shape[1]), int(image_shape[2]))
        mods.append(("reshape", Reshape(c, h, w)))
        shape = [c, h, w]
    else:
        mods.append(("reshape", Reshape(1, n_features)))
        shape = [1, n_features]
    Conv, Pool, BN = (nn.Conv2d, nn.MaxPool2d, nn.BatchNorm2d) if two_d else (nn.Conv1d, nn.MaxPool1d, nn.BatchNorm1d)
    conv_layers = [l for l in layers if l.get("type") == "conv"]
    dense_layers = [l for l in layers if l.get("type", "dense") == "dense"]
    for i, L in enumerate(conv_layers):
        f = max(1, int(L.get("filters", 16)))
        k = max(1, int(L.get("kernel", 3)))
        block = [Conv(shape[0], f, k, padding=k // 2)]
        if L.get("batchnorm"):
            block.append(BN(f))
        block.append(act(L.get("activation")))
        spatial = shape[1:]
        # 'same'-ish padding: even kernels grow length by one
        spatial = [s + 2 * (k // 2) - k + 1 for s in spatial]
        p = int(L.get("pool") or 0)
        if p >= 2 and min(spatial) >= p:
            block.append(Pool(p))
            spatial = [s // p for s in spatial]
        mods.append((f"conv{i + 1}", nn.Sequential(*block)))
        shape = [f, *spatial]
    if two_d and arch.get("global_pool"):
        # average each feature map over the whole image: position-independent and far fewer weights than flattening
        mods.append(("global_pool", nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten())))
        width = shape[0]
    else:
        mods.append(("flatten", nn.Flatten()))
        width = int(math.prod(shape))
    for i, L in enumerate(dense_layers):
        u = max(1, int(L.get("units", 32)))
        block = [nn.Linear(width, u), act(L.get("activation"))]
        if float(L.get("dropout") or 0) > 0:
            block.append(nn.Dropout(float(L["dropout"])))
        mods.append((f"dense{i + 1}", nn.Sequential(*block)))
        width = u
    mods.append(("output", nn.Linear(width, n_out)))
    return nn.Sequential(*[m for _, m in mods]), [n for n, _ in mods]


class ResBlock(nn.Module):
    def __init__(self, cin, cout, stride):
        super().__init__()
        self.c1 = nn.Conv2d(cin, cout, 3, stride, 1, bias=False)
        self.b1 = nn.BatchNorm2d(cout)
        self.c2 = nn.Conv2d(cout, cout, 3, 1, 1, bias=False)
        self.b2 = nn.BatchNorm2d(cout)
        self.skip = nn.Identity() if stride == 1 and cin == cout else nn.Sequential(nn.Conv2d(cin, cout, 1, stride, bias=False), nn.BatchNorm2d(cout))

    def forward(self, x):
        return torch.relu(self.b2(self.c2(torch.relu(self.b1(self.c1(x))))) + self.skip(x))


class TinyResNet(nn.Module):
    """A small residual network for images: stem → stages of residual blocks → global average pool → head."""

    def __init__(self, image_shape, n_out, width=16, stages=3, blocks=1, dropout=0.1):
        super().__init__()
        c, h, w = (1, *image_shape) if len(image_shape) == 2 else image_shape
        self.shape = (int(c), int(h), int(w))
        self.stem = nn.Sequential(nn.Conv2d(self.shape[0], width, 3, 1, 1, bias=False), nn.BatchNorm2d(width), nn.ReLU())
        layers, cin = [], width
        for s_ in range(int(stages)):
            cout = width * (2 ** s_)
            for b in range(int(blocks)):
                layers.append(ResBlock(cin, cout, 2 if (b == 0 and s_ > 0) else 1))
                cin = cout
        self.body = nn.Sequential(*layers)
        self.head = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(float(dropout)), nn.Linear(cin, n_out))

    def forward(self, x):
        return self.head(self.body(self.stem(x.reshape(x.shape[0], *self.shape))))


class TextNet(nn.Module):
    """Token ids (B, L) → embeddings → (mean pool | GRU | Transformer) → head. Padding id 0 is masked out."""

    def __init__(self, kind, vocab_size, max_len, n_out, embed_dim=64, hidden=64, layers=1, heads=4, dropout=0.2):
        super().__init__()
        self.kind = kind
        embed_dim = max(heads, int(embed_dim) // max(1, int(heads)) * max(1, int(heads))) if kind == "text_transformer" else int(embed_dim)
        self.emb = nn.Embedding(int(vocab_size), embed_dim, padding_idx=0)
        self.drop = nn.Dropout(float(dropout))
        if kind == "gru":
            self.rnn = nn.GRU(embed_dim, int(hidden), num_layers=max(1, int(layers)), batch_first=True, bidirectional=True,
                              dropout=float(dropout) if int(layers) > 1 else 0.0)
            out_dim = 2 * int(hidden)
        elif kind == "text_transformer":
            self.pos = nn.Parameter(torch.randn(1, int(max_len), embed_dim) * 0.02)
            layer = nn.TransformerEncoderLayer(embed_dim, int(heads), dim_feedforward=2 * embed_dim, dropout=float(dropout),
                                               batch_first=True, norm_first=True)
            self.enc = nn.TransformerEncoder(layer, num_layers=max(1, int(layers)), enable_nested_tensor=False)
            out_dim = embed_dim
        else:
            out_dim = embed_dim
        self.head = nn.Sequential(nn.Linear(out_dim, int(hidden)), nn.ReLU(), nn.Dropout(float(dropout)), nn.Linear(int(hidden), n_out))

    def forward(self, x):
        ids = x.long().clamp(min=0, max=self.emb.num_embeddings - 1)
        mask = (ids > 0).float()
        e = self.drop(self.emb(ids))
        if self.kind == "gru":
            e, _ = self.rnn(e)
        elif self.kind == "text_transformer":
            pad = ids == 0
            pad[:, 0] = False  # never mask every position
            e = self.enc(e + self.pos[:, : e.shape[1]], src_key_padding_mask=pad)
        pooled = (e * mask[..., None]).sum(1) / mask.sum(1, keepdim=True).clamp(min=1)
        return self.head(pooled)


TEXT_KINDS = ("embedding_bag", "gru", "text_transformer")


def build(arch: dict, n_features: int, n_out: int, image_shape=None):
    kind = arch.get("kind", "mlp")
    if kind in TEXT_KINDS:
        return TextNet(kind, arch.get("vocab_size", 8000), arch.get("max_len", n_features), n_out, arch.get("embed_dim", 64),
                       arch.get("hidden", 64), arch.get("layers", 1), arch.get("heads", 4), arch.get("dropout", 0.2)), None
    if kind == "tiny_resnet":
        if not image_shape:
            raise ValueError("The ResNet needs image data.")
        return TinyResNet(image_shape, n_out, arch.get("width", 16), arch.get("stages", 3), arch.get("blocks", 1), arch.get("dropout", 0.1)), None
    if kind == "ft_transformer":
        m = FTTransformer(n_features, n_out, arch.get("d_token", 32), arch.get("n_blocks", 2), arch.get("n_heads", 4),
                          arch.get("ffn_mult", 2), arch.get("dropout", 0.1))
        return m, None
    if kind == "gcn":
        from .gcn import GCN
        return GCN(n_features, n_out, arch.get("hidden", [64, 32]), arch.get("activation", "relu"), arch.get("dropout", 0.3)), None
    return _sequential(arch, n_features, n_out, image_shape)


def summarize(arch: dict, n_features: int, n_out: int, image_shape=None) -> dict:
    """Dry-run a tiny batch to report per-layer output shapes and parameter counts."""
    try:
        model, names = build(arch, n_features, n_out, image_shape)
    except Exception as e:  # noqa: BLE001 - surface any construction error to the UI
        return {"ok": False, "errors": [str(e)], "layers": [], "total_params": 0}
    total = sum(p.numel() for p in model.parameters())
    layers = []
    kind = arch.get("kind", "mlp")
    model.eval()
    if names is not None:
        x = torch.zeros(2, n_features)
        with torch.no_grad():
            for name, mod in zip(names, model):
                x = mod(x)
                layers.append({"name": name, "out_shape": list(x.shape[1:]), "params": sum(p.numel() for p in mod.parameters())})
    elif kind in TEXT_KINDS:
        d = model.emb.embedding_dim
        layers = [{"name": "embedding", "out_shape": [n_features, d], "params": model.emb.weight.numel()}]
        if kind == "gru":
            layers.append({"name": "gru", "out_shape": [n_features, model.rnn.hidden_size * 2], "params": sum(p.numel() for p in model.rnn.parameters())})
        elif kind == "text_transformer":
            layers.append({"name": "attention", "out_shape": [n_features, d], "params": sum(p.numel() for p in model.enc.parameters())})
        layers.append({"name": "average", "out_shape": [layers[-1]["out_shape"][-1]], "params": 0})
        layers.append({"name": "output", "out_shape": [n_out], "params": sum(p.numel() for p in model.head.parameters())})
    elif kind == "tiny_resnet":
        x = torch.zeros(2, n_features)
        with torch.no_grad():
            h = model.stem(x.reshape(2, *model.shape))
            layers.append({"name": "stem", "out_shape": list(h.shape[1:]), "params": sum(p.numel() for p in model.stem.parameters())})
            for i, blk in enumerate(model.body):
                h = blk(h)
                layers.append({"name": f"resblock{i + 1}", "out_shape": list(h.shape[1:]), "params": sum(p.numel() for p in blk.parameters())})
        layers.append({"name": "output", "out_shape": [n_out], "params": sum(p.numel() for p in model.head.parameters())})
    elif kind == "ft_transformer":
        d = model.weight.shape[1]
        layers = [{"name": "tokenizer", "out_shape": [n_features + 1, d], "params": model.weight.numel() * 2 + d}]
        for i, blk in enumerate(model.encoder.layers):
            layers.append({"name": f"attention{i + 1}", "out_shape": [n_features + 1, d], "params": sum(p.numel() for p in blk.parameters())})
        layers.append({"name": "output", "out_shape": [n_out], "params": sum(p.numel() for p in model.head.parameters())})
    else:  # gcn
        for i, lin in enumerate(model.layers):
            layers.append({"name": f"graphconv{i + 1}", "out_shape": [lin.out_features], "params": sum(p.numel() for p in lin.parameters())})
        layers[-1]["name"] = "output"
    return {"ok": True, "errors": [], "layers": layers, "total_params": int(total), "input_shape": [n_features]}
