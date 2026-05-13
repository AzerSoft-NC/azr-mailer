import { loadConfig } from "./config.js";
import { createApp } from "./createApp.js";

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, "0.0.0.0", () => {
  console.log(`azr-mailer listening on :${config.port}`);
});
