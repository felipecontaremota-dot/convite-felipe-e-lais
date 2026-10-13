import { AppError } from "../../lib/errors";

interface PushRegistration {
  requestPermission: () => Promise<{ status: string }>;
  projectId: () => string | undefined;
  token: (projectId: string) => Promise<string>;
  register: (token: string) => Promise<string>;
}

export async function registerProfilePush(deps: PushRegistration) {
  const { status } = await deps.requestPermission();
  if (status !== "granted")
    throw new AppError("Permissão de notificações não concedida.");
  const projectId = deps.projectId();
  if (!projectId)
    throw new AppError("Configure o projeto EAS antes de registrar push.");
  return deps.register(await deps.token(projectId));
}
