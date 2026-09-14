module.exports = async function handler(event, api) {
  const skillName = event.skill?.name || "unknown";

  api.logger.info("========== HOOK TRIGGERED ==========");
  api.logger.info(`Skill: ${skillName}`);
  api.logger.info("[1/3] static check");
  api.logger.info("[2/3] permission check");
  api.logger.info("[3/3] sandbox check");
  api.logger.info("========== CHECK DONE ==========");
};
