const multer = require('multer');
const agentService = require('../services/agent.service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
}).fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'cvResume', maxCount: 1 }
]);

const handleUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: 'File upload failed' });
    }
    next();
  });
};

const listAgents = async (req, res) => {
  try {
    const featured = req.query.featured === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const data = await agentService.listAgents({ featured, limit });
    res.json({ success: true, message: 'Agents fetched successfully', data });
  } catch (err) {
    console.error('Error fetching agents', err);
    res.status(500).json({ success: false, message: 'Failed to fetch agents' });
  }
};

const listFeaturedAgents = async (req, res) => {
  try {
    const data = await agentService.listAgents({ featured: true, limit: 6 });
    res.json({ success: true, message: 'Featured agents fetched successfully', data });
  } catch (err) {
    console.error('Error fetching featured agents', err);
    res.status(500).json({ success: false, message: 'Failed to fetch featured agents' });
  }
};

const getAgent = async (req, res) => {
  try {
    const agent = await agentService.getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (err) {
    console.error('Error fetching agent', err);
    res.status(500).json({ success: false, message: 'Failed to fetch agent details' });
  }
};

const getApplicationDetails = async (req, res) => {
  try {
    const data = await agentService.getAgentApplicationByUserId(req.user._id);
    res.json({ success: true, data: data || null });
  } catch (err) {
    console.error('Error fetching agent application details', err);
    res.status(500).json({ success: false, message: 'Failed to fetch agent application details' });
  }
};

const submitApplication = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, message: 'Request body is required' });
    }

    if (!req.files?.cvResume?.[0]) {
      return res.status(400).json({ success: false, message: 'Resume file is required' });
    }
    if (!req.files?.profilePhoto?.[0]) {
      return res.status(400).json({ success: false, message: 'Profile photo is required' });
    }

    const data = await agentService.submitAgentApplication({
      userId: req.user._id,
      payload: req.body,
      files: req.files
    });

    res.status(201).json({ success: true, message: 'Application submitted successfully', data });
  } catch (err) {
    console.error('Error submitting agent application', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to submit application' });
  }
};

module.exports = {
  listAgents,
  listFeaturedAgents,
  getAgent,
  getApplicationDetails,
  submitApplication,
  handleUpload
};
