"""Print the first free TCP port on 127.0.0.1 in [start, end] (default 8765–8800)."""
import socket
import sys

start = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
end = int(sys.argv[2]) if len(sys.argv) > 2 else 8800
for port in range(start, end + 1):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
        except OSError:
            continue
        print(port)
        sys.exit(0)
sys.exit(1)
