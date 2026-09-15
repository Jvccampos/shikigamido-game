import { defineRailway, github, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const data = volume("shikigamido-game-volume", {
    sizeMB: 5000,
    region: "us-east4-eqdc4a",
  });
  const web = service("shikigamido", {
    source: github("Jvccampos/shikigamido-game", {
      branch: "main",
      checkSuites: true,
    }),
    healthcheck: "/healthz",
    healthcheckTimeout: 120,
    variables: {
      PUBLIC_URL: "https://shikigamido-game-production.up.railway.app",
      RAILWAY_RUN_UID: "0",
    },
    volumeMounts: { "/data": data },
  });
  web.build = { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" };
  web.deploy = {
    ...web.deploy,
    restartPolicyType: "ON_FAILURE",
    restartPolicyMaxRetries: 5,
  };
  return project("shikigamido-game", { resources: [web, data] });
});
