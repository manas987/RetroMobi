type Particle = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  inverseMass: number;
};

type Link = { from: Particle; to: Particle; length: number };
type Card = { clip: Particle; body: Particle };
export type RopePull = { point: Particle; x: number; y: number };
type FaqRope = {
  rope: Particle[];
  cards: Card[];
  moving: Particle[];
  links: Link[];
};

export const ROPE_STEP = 1 / 120;
const GRAVITY = 720;
const DAMPING = 0.976;
const ANCHOR_Y = 13;

function particle(x: number, y: number, inverseMass: number): Particle {
  return { x, y, previousX: x, previousY: y, inverseMass };
}

export function createFaqRope(width: number, cards: { x: number; length: number }[]): FaqRope {
  const left = 5;
  const right = width - left;
  const rope = [particle(left, ANCHOR_Y, 0)];
  const links: Link[] = [];
  const hanging: Card[] = [];

  // Start with slack, then let gravity and the card weights find the resting shape.
  for (const card of [...cards, { x: right, length: 0 }]) {
    const start = rope[rope.length - 1]!;
    const segments = Math.ceil((card.x - start.x) / 55);
    for (let i = 1; i <= segments; i++) {
      const x = start.x + ((card.x - start.x) * i) / segments;
      const t = (x - left) / (right - left);
      const next = particle(x, ANCHOR_Y + 4 * 30 * t * (1 - t), x === right ? 0 : 1);
      const from = rope[rope.length - 1]!;
      links.push({ from, to: next, length: Math.hypot(next.x - from.x, next.y - from.y) });
      rope.push(next);
    }
    if (card.length) {
      const clip = rope[rope.length - 1]!;
      const body = particle(clip.x, clip.y + card.length, 0.55);
      hanging.push({ clip, body });
      links.push({ from: clip, to: body, length: card.length });
    }
  }

  const moving = [...rope.slice(1, -1), ...hanging.map((card) => card.body)];
  const simulation = { rope, cards: hanging, moving, links };
  for (let i = 0; i < 360; i++) stepFaqRope(simulation);
  return simulation;
}

export function pushFaqPoint(point: Particle, velocityX: number, velocityY: number) {
  const speedX = (point.x - point.previousX) / ROPE_STEP + velocityX;
  const speedY = (point.y - point.previousY) / ROPE_STEP + velocityY;
  point.previousX = point.x - Math.max(-380, Math.min(380, speedX)) * ROPE_STEP;
  point.previousY = point.y - Math.max(-260, Math.min(260, speedY)) * ROPE_STEP;
}

export function stepFaqRope(simulation: FaqRope, pull?: RopePull) {
  for (const point of simulation.moving) {
    const { x, y } = point;
    point.x += (x - point.previousX) * DAMPING;
    point.y += (y - point.previousY) * DAMPING + GRAVITY * ROPE_STEP ** 2;
    point.previousX = x;
    point.previousY = y;
  }

  if (pull) {
    pull.point.x += (pull.x - pull.point.x) * 0.016;
    pull.point.y += (pull.y - pull.point.y) * 0.016;
  }

  // The clip is the same particle in both links, so a moving card pulls on the rope.
  for (let pass = 0; pass < 24; pass++) {
    for (let i = 0; i < simulation.links.length; i++) {
      const { from, to, length } = simulation.links[pass % 2 ? simulation.links.length - i - 1 : i]!;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (!distance) continue;
      const correction = (distance - length) / (distance * (from.inverseMass + to.inverseMass));
      from.x += dx * correction * from.inverseMass;
      from.y += dy * correction * from.inverseMass;
      to.x -= dx * correction * to.inverseMass;
      to.y -= dy * correction * to.inverseMass;
    }
  }
}
