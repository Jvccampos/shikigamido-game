import { defineRailway, project, service, volume, preserve } from "railway/iac";

export default defineRailway(() => {
  const data = volume("shikigamido-game-volume", {
    sizeMB: 5000,
    region: "us-east4-eqdc4a",
  });
  const web = service("shikigamido-game", {
    healthcheck: "/healthz",
    healthcheckTimeout: 120,
    variables: {
      PUBLIC_URL: "https://shikigamido-game-production.up.railway.app",
      RAILWAY_RUN_UID: "0",
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
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
