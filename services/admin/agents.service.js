const agentService = require('../../services/agent.service');

const getApprovedAgents = async () => {
  return agentService.listAgents({ featured: false });
};

const getAgentApplications = async () => {
  return agentService.listAgentApplications();
};

const updateAgentApplication = async ({ id, data }) => {
  return agentService.updateAgentApplication({ id, data });
};

const setAgentFeatured = async ({ id, isFeatured }) => {
  return agentService.updateAgentFeature({ id, isFeatured });
};

const updateAgent = async ({ id, data }) => {
  return agentService.updateAgent({ id, data });
};

const deleteAgent = async (id) => {
  return agentService.deleteAgent(id);
};

module.exports = {
  getApprovedAgents,
  getAgentApplications,
  updateAgentApplication,
  setAgentFeatured,
  updateAgent,
  deleteAgent
};
