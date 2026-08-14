/**
 * Reader for the projects resource of the psauerborn.dev API.
 *
 * `GET /v1/projects/list` returns every project flagged for display; hidden
 * projects are excluded by the API and an empty listing serializes as an empty
 * array. The envelope is unwrapped here so call sites work with a plain array,
 * which is the only shape a listing view needs.
 */

import { fetchJson } from './client';
import type { Project, ProjectListResponse } from './types';

/** Path of the project listing endpoint. */
const PROJECT_LIST_PATH = '/v1/projects/list';

/**
 * listProjects returns the projects flagged for display.
 *
 * @returns the projects, empty when nothing is displayed; `github_link` is null
 *   for a project without a repository.
 * @throws ApiError when the request fails or the body cannot be decoded.
 */
export async function listProjects(): Promise<Project[]> {
  const response = await fetchJson<ProjectListResponse>(PROJECT_LIST_PATH);
  return response.projects;
}
