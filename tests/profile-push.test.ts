import { expect, it, vi } from "vitest";
import { registerProfilePush } from "../src/features/guests/profilePush";

function fixture(status: string, project = "fixture-project") {
  return {
    requestPermission: vi.fn().mockResolvedValue({ status }),
    projectId: vi.fn(() => project),
    token: vi.fn().mockResolvedValue("ExpoPushToken[fixture]"),
    register: vi.fn().mockResolvedValue("Sincronizado com sucesso."),
  };
}

it("native permission denial cannot obtain a token or enqueue PUSH_REGISTER", async () => {
  const deps = fixture("denied");
  await expect(registerProfilePush(deps)).rejects.toThrow("não concedida");
  expect(deps.projectId).not.toHaveBeenCalled();
  expect(deps.token).not.toHaveBeenCalled();
  expect(deps.register).not.toHaveBeenCalled();
});

it("permission alone cannot register without an EAS project", async () => {
  const deps = fixture("granted", "");
  await expect(registerProfilePush(deps)).rejects.toThrow(
    "Configure o projeto EAS",
  );
  expect(deps.token).not.toHaveBeenCalled();
  expect(deps.register).not.toHaveBeenCalled();
});

it("explicit native activation obtains the project token and registers exactly once", async () => {
  const deps = fixture("granted");
  await expect(registerProfilePush(deps)).resolves.toBe(
    "Sincronizado com sucesso.",
  );
  expect(deps.requestPermission).toHaveBeenCalledTimes(1);
  expect(deps.token).toHaveBeenCalledExactlyOnceWith("fixture-project");
  expect(deps.register).toHaveBeenCalledExactlyOnceWith(
    "ExpoPushToken[fixture]",
  );
});
