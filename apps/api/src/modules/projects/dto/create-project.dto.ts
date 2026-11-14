import { z } from 'zod';
import { ProjectInput } from '@hey-jenna/contracts';

/** POST /projects: a name, plus an optional kind (condo, house…) and shared palette. */
export const CreateProjectSchema = ProjectInput;
export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
