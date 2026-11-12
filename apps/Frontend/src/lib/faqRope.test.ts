import { expect, test } from "bun:test";
import { createFaqRope, pushFaqPoint, stepFaqRope, type RopePull } from "./faqRope";

function hangingCards() {
  return createFaqRope(1240, [106, 95, 109, 127, 100].map((length, i) => ({
    x: 163 + i * 228.5,
    length,
  })));
}

function advance(rope: ReturnType<typeof hangingCards>, steps: number, pull?: RopePull) {
  for (let i = 0; i < steps; i++) stepFaqRope(rope, pull);
}

test("a pushed card swings and sends a ripple along the anchored rope", () => {
  const rope = hangingCards();
  const left = rope.rope[0]!;
  const right = rope.rope[rope.rope.length - 1]!;
  const card = rope.cards[2]!;
  const neighbor = rope.cards[1]!.clip;
  const restY = neighbor.y;
  const restSwing = card.body.x - card.clip.x;
  expect(card.clip.y).toBeGreaterThan(left.y + 25);

  pushFaqPoint(card.body, 60, 185);
  advance(rope, 24);
  expect(card.body.x - card.clip.x - restSwing).toBeGreaterThan(5);
  expect(neighbor.y - restY).toBeGreaterThan(1);
  advance(rope, 30);
  expect(neighbor.y).toBeLessThan(restY);
  expect([left.x, left.y, right.x, right.y]).toEqual([5, 13, 1235, 13]);

  advance(rope, 310);
  expect(Math.abs(neighbor.y - restY)).toBeLessThan(0.25);
  expect(Math.abs(card.body.x - card.clip.x - restSwing)).toBeLessThan(0.5);
});

test("pulling the rope moves an attached card and releasing lets it return", () => {
  const rope = hangingCards();
  const card = rope.cards[2]!;
  const point = rope.rope.find((point) => point.x > 500)!;
  const restY = card.clip.y;

  advance(rope, 100, { point, x: point.x + 10, y: point.y + 55 });
  expect(card.clip.y - restY).toBeGreaterThan(5);
  expect(Math.abs(Math.hypot(card.body.x - card.clip.x, card.body.y - card.clip.y) - 109)).toBeLessThan(0.5);

  advance(rope, 360);
  expect(Math.abs(card.clip.y - restY)).toBeLessThan(0.25);
});
