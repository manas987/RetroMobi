import { expect, test } from "bun:test";
import { canPreviewImage, messageCaption, type Message } from "./tickets";

test("an attachment appears once and a real caption stays visible", () => {
  const message: Message = {
    id: "message",
    sender_type: "CUSTOMER",
    sender_id: "rider",
    body: "📎 scooter.jpg",
    created_at: "2026-11-16T12:00:00Z",
    attachments: [{ id: "photo", file_name: "scooter.jpg" }],
  };
  expect(messageCaption(message)).toBe("");
  expect(messageCaption({ ...message, body: "Attachment · scooter.jpg" })).toBe("");
  expect(messageCaption({ ...message, body: "Here is the scooter at pickup." })).toBe("Here is the scooter at pickup.");
  expect(messageCaption({ ...message, attachments: [] })).toBe("📎 scooter.jpg");
});

test("chat previews small photos and keeps documents and large uploads as file rows", () => {
  const photo = { id: "photo", file_name: "Scooter.JPG", size_bytes: 1000 };
  expect(canPreviewImage(photo)).toBe(true);
  expect(canPreviewImage({ ...photo, file_name: "receipt.pdf" })).toBe(false);
  expect(canPreviewImage({ ...photo, size_bytes: 9 * 1024 * 1024 })).toBe(false);
});
