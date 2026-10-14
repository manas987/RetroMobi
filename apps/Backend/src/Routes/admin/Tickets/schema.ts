import { z } from "zod";

export const QueueQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
  assignedTo: z.string().optional(),
  unassigned: z.coerce.boolean().optional(),
});

export const MessagesQuerySchema = z.object({
  since: z.string().uuid().optional(),
});

export const PostMessageSchema = z.object({
  body: z.string().min(1),
});

export const AssignTicketSchema = z.object({
  adminId: z.string().uuid(),
});

export const ResolveTicketSchema = z.object({
  resolution: z.string().min(1),
});

export const AddParticipantSchema = z.object({
  partyType: z.enum(["CUSTOMER", "MERCHANT"]),
  partyId: z.string().uuid(),
});

export const SettleDepositSchema = z
  .object({
    refundToCustomer: z.number().int().nonnegative(),
    toMerchant: z.number().int().nonnegative(),
    note: z.string().min(1),
  });
