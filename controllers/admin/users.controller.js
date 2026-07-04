const userService = require('../../services/admin/users.service');

const listUsers = async (req, res) => {
  try {
    const { search, role } = req.query;
    const users = await userService.listUsers({ search, role });
    return res.json(users);
  } catch (err) {
    console.error('List users error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to fetch users' });
  }
};

const createUser = async (req, res) => {
  try {
    const user = await userService.createUser(req.body);
    return res.status(201).json(user);
  } catch (err) {
    console.error('Create user error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to create user' });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await userService.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(user);
  } catch (err) {
    console.error('Get user error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to fetch user' });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(user);
  } catch (err) {
    console.error('Update user error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to update user' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const success = await userService.deleteUser(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('Delete user error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to delete user' });
  }
};

const uploadProfileImage = async (req, res) => {
  try {
    const result = await userService.uploadProfileImage(req.user._id, req.file);
    return res.json({ success: true, imageUrl: result.imageUrl });
  } catch (err) {
    console.error('Upload profile image error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to upload image' });
  }
};

const deleteProfileImage = async (req, res) => {
  try {
    await userService.deleteProfileImage(req.user._id);
    return res.json({ message: 'Profile image deleted successfully' });
  } catch (err) {
    console.error('Delete profile image error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to delete profile image' });
  }
};

module.exports = {
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  uploadProfileImage,
  deleteProfileImage
};
