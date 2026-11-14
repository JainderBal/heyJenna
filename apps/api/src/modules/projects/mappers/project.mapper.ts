import { Project } from '@prisma/client';
import { ProjectResponseDto } from '../dto/project-response.dto';

/** Database row → response DTO. */
export function toProjectResponse(project: Project): ProjectResponseDto {
  return {
    id: project.id,
    name: project.name,
    kind: project.kind,
    palette: project.palette,
    budgetCad: project.budgetCad,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
