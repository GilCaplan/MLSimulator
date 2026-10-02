/* Plain-language "what you'll learn" bullets for each lab. */
export const LAB_ORDER = ["gan", "vae", "transfer", "bandit", "gridworld"];

export const LEARN: Record<string, { title: string; bullets: string[] }> = {
  gan: {
    title: "Two networks, one game",
    bullets: [
      "A GAN is two networks playing a game: a forger makes fake points, a detective tries to tell them from real ones.",
      "Neither is told what the shape looks like — the forger improves only from the detective's feedback.",
      "The shaded background is the detective's opinion of every spot. When the forger wins, it can't tell real from fake and the map fades.",
      "If the forger finds one trick and repeats it, only part of the shape gets covered. That's called mode collapse.",
    ],
  },
  vae: {
    title: "Squeeze, then rebuild",
    bullets: [
      "An autoencoder squeezes each 8×8 digit (64 numbers) down to just 2, then tries to rebuild the digit from those 2.",
      "Those 2 numbers are coordinates, so every digit gets a spot on a map — similar digits end up near each other, without anyone labelling them.",
      "The decoder half can turn any spot on the map back into an image, even spots no real digit landed on.",
      "A variational autoencoder (VAE) is nudged to keep the map compact and gap-free, which makes it smoother to explore.",
    ],
  },
  transfer: {
    title: "Don't start from zero",
    bullets: [
      "Networks first learn simple things like edges and curves, then combine them into whole objects.",
      "Those early skills carry over to new jobs: a network that learned shapes and arrows already “sees” the strokes in a digit.",
      "Freezing re-uses those layers as they are and trains only a new last layer. Fine-tuning gently adjusts everything.",
      "The fewer labelled examples you have, the more re-using a pre-trained network helps.",
    ],
  },
  bandit: {
    title: "Explore or exploit?",
    bullets: [
      "Each slot machine pays out at a hidden rate. The only way to find the best one is to try them.",
      "Exploring means trying machines you're unsure about. Exploiting means sticking with the best one so far.",
      "Too much exploring wastes pulls on bad machines; too little can lock you onto a mediocre one forever.",
      "Strategies like ε-greedy and UCB balance the two automatically. The same trade-off drives ad testing and recommendations.",
    ],
  },
  gridworld: {
    title: "Learning by trial and error",
    bullets: [
      "The robot isn't told the route. It only gets a reward at the goal and a small penalty for every step.",
      "Q-learning keeps a score for every move in every square: how good it is to go that way from here.",
      "At first the robot wanders randomly. As rewards trickle back through the scores, a route emerges.",
      "This is reinforcement learning — the same idea behind game-playing AIs and robot control.",
    ],
  },
};
