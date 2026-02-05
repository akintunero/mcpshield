import { z } from 'zod';

/** Status of an approval request in the human-in-the-loop workflow. */
export const ApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'executed',
  'expired',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/** An approval request that gates one or more remediations. */
export const ApprovalSchema = z.object({
  approvalId: z.string().min(1),
  findingIds: z.array(z.string().min(1)).min(1),
  requestedBy: z.string().min(1),
  createdAt: z.string().datetime(),
  status: ApprovalStatusSchema.default('pending'),
  approvedBy: z.string().optional(),
  decidedAt: z.string().datetime().optional(),
  note: z.string().optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;
