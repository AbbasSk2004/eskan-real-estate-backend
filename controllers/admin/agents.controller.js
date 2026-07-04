const adminAgentService = require('../../services/admin/agents.service');

const getApprovedAgents = async (req, res) => {
  try {
    const data = await adminAgentService.getApprovedAgents();
    return res.json(data);
  } catch (err) {
    console.error('Error fetching approved agents', err);
    return res.status(500).json({ error: 'Failed to fetch approved agents' });
  }
};

const getAgentApplications = async (req, res) => {
  try {
    const data = await adminAgentService.getAgentApplications();
    return res.json(data);
  } catch (err) {
    console.error('Error fetching agent applications', err);
    return res.status(500).json({ error: 'Failed to fetch agent applications' });
  }
};

const updateAgentApplication = async (req, res) => {
  try {
    const id = req.params.id;
    const { status, approved, approved_at } = req.body;

    const updated = await adminAgentService.updateAgentApplication({
      id,
      data: {
        status,
        approved,
        approvedAt: approved_at || (approved ? new Date() : undefined)
      }
    });

    if (!updated) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('Error updating agent application', err);
    return res.status(500).json({ error: 'Failed to update agent application' });
  }
};

const setAgentFeatured = async (req, res) => {
  try {
    const id = req.params.id;
    const { is_featured } = req.body;

    const updated = await adminAgentService.setAgentFeatured({ id, isFeatured: is_featured });
    if (!updated) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('Error setting agent feature status', err);
    return res.status(500).json({ error: 'Failed to update agent feature status' });
  }
};

const updateAgent = async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;

    const updated = await adminAgentService.updateAgent({ id, data: updateData });
    if (!updated) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('Error updating agent', err);
    return res.status(500).json({ error: 'Failed to update agent' });
  }
};

const deleteAgent = async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await adminAgentService.deleteAgent(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    return res.json({ message: 'Agent deleted successfully' });
  } catch (err) {
    console.error('Error deleting agent', err);
    return res.status(500).json({ error: 'Failed to delete agent' });
  }
};

module.exports = {
  getApprovedAgents,
  getAgentApplications,
  updateAgentApplication,
  setAgentFeatured,
  updateAgent,
  deleteAgent
};
