import { z } from 'zod';
import { ProjectInput } from '@hey-jenna/contracts';

/** PATCH /projects/:id: any of the create fields; kind may be cleared with null. */
export const UpdateProjectSchema = ProjectInput.extend({ kind: ProjectInput.shape.kind.nullable() }).partial();
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;
