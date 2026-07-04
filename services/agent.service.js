const Agent = require('../models/agent.model');
const User = require('../models/user.model');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');

const transformAgent = (agentDoc) => {
  if (!agentDoc) return null;
  const agent = agentDoc.toObject ? agentDoc.toObject() : agentDoc;
  const user = agent.userId || null;

  return {
    id: agent._id,
    userId: agent.userId,
    specialty: agent.specialty,
    experience: agent.experience,
    about_me: agent.aboutMe,
    cv_resume_url: agent.cvUrl,
    facebook_url: agent.social?.facebook || null,
    twitter_url: agent.social?.twitter || null,
    instagram_url: agent.social?.instagram || null,
    phone: agent.phone,
    image: agent.image,
    is_featured: agent.isFeatured,
    status: agent.status,
    approved: agent.approved,
    approved_at: agent.approvedAt,
    languages: agent.languages || [],
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
    profiles: user
      ? {
          firstname: user.firstName,
          lastname: user.lastName,
          email: user.email,
          profile_photo: user.profilePhoto?.url,
          phone: user.phone
        }
      : null
  };
};

const listAgents = async ({ limit = 50, featured = false } = {}) => {
  const filter = { approved: true, status: 'approved' };
  if (featured) filter.isFeatured = true;

  const agents = await Agent.find(filter)
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate('userId', 'firstName lastName email profilePhoto phone');

  return agents.map(transformAgent);
};

const getAgentById = async (id) => {
  const agent = await Agent.findById(id).populate('userId', 'firstName lastName email profilePhoto phone');
  return transformAgent(agent);
};

const getAgentApplicationByUserId = async (userId) => {
  const agent = await Agent.findOne({ userId }).populate('userId', 'firstName lastName email profilePhoto phone');
  return transformAgent(agent);
};

const submitAgentApplication = async ({ userId, payload, files }) => {
  const existing = await Agent.findOne({ userId });

  const agentData = {
    userId,
    specialty: payload.specialization,
    experience: payload.experience,
    aboutMe: payload.bio,
    phone: payload.phone,
    languages: payload.languages
      ? String(payload.languages)
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean)
      : [],
    social: {
      facebook: payload.facebook_url || null,
      twitter: payload.twitter_url || null,
      instagram: payload.instagram_url || null
    },
    status: 'pending',
    approved: false
  };

  // Handle uploads
  if (files) {
    const folder = `agents/${userId}`;

    if (files.cvResume && files.cvResume[0]) {
      const file = files.cvResume[0];
      const filename = `${userId}-cv-${Date.now()}`;

      // Remove old resume if present
      if (existing?.cvPublicId) {
        await deleteFromCloudinary(existing.cvPublicId).catch(() => {});
      }

      const result = await uploadToCloudinary({ buffer: file.buffer, folder, filename, resourceType: 'raw' });
      agentData.cvUrl = result.secure_url;
      agentData.cvPublicId = result.public_id;
    }

    if (files.profilePhoto && files.profilePhoto[0]) {
      const file = files.profilePhoto[0];
      const filename = `${userId}-photo-${Date.now()}`;

      // Remove old profile image if present
      if (existing?.image?.publicId) {
        await deleteFromCloudinary(existing.image.publicId).catch(() => {});
      }

      const result = await uploadToCloudinary({ buffer: file.buffer, folder, filename, resourceType: 'image' });
      agentData.image = { url: result.secure_url, publicId: result.public_id };
    }
  }

  if (existing) {
    Object.assign(existing, agentData);
    await existing.save();
    return transformAgent(await existing.populate('userId', 'firstName lastName email profilePhoto phone'));
  }

  const newAgent = new Agent(agentData);
  await newAgent.save();
  return transformAgent(await newAgent.populate('userId', 'firstName lastName email profilePhoto phone'));
};

const listAgentApplications = async () => {
  const agents = await Agent.find({ approved: false }).sort({ createdAt: -1 }).populate('userId', 'firstName lastName email profilePhoto phone');
  return agents.map(transformAgent);
};

const updateAgentApplication = async ({ id, data }) => {
  const agent = await Agent.findById(id).populate('userId', 'firstName lastName email profilePhoto phone');
  if (!agent) return null;
  if (data.status !== undefined) agent.status = data.status;
  if (data.approved !== undefined) agent.approved = data.approved;
  if (data.approvedAt !== undefined) agent.approvedAt = data.approvedAt;
  await agent.save();
  return transformAgent(agent);
};

const updateAgentFeature = async ({ id, isFeatured }) => {
  const agent = await Agent.findById(id).populate('userId', 'firstName lastName email profilePhoto phone');
  if (!agent) return null;
  agent.isFeatured = Boolean(isFeatured);
  await agent.save();
  return transformAgent(agent);
};

const updateAgent = async ({ id, data }) => {
  const agent = await Agent.findById(id).populate('userId', 'firstName lastName email profilePhoto phone');
  if (!agent) return null;
  Object.assign(agent, data);
  await agent.save();
  return transformAgent(agent);
};

const deleteAgent = async (id) => {
  const agent = await Agent.findById(id);
  if (!agent) return false;
  await agent.deleteOne();
  return true;
};

module.exports = {
  listAgents,
  getAgentById,
  getAgentApplicationByUserId,
  submitAgentApplication,
  listAgentApplications,
  updateAgentApplication,
  updateAgentFeature,
  updateAgent,
  deleteAgent
};
