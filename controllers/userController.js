const { user } = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require('fs');
const path = require('path');

// User Registration (Sign up)
exports.registerUser = async (req, res, next) => {
  try {
    const { first_name, last_name, email, password, phone_number } = req.body;
    

    // Check if user already exists
    const existingUser = await user.findOne({ where: { email } });

    if (existingUser && !existingUser.is_deleted) {
      return res.status(200).json({
        result_code: 0,
        message: "User with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let newUser;

    if (existingUser && existingUser.is_deleted) {
      // Reactivate soft-deleted user
      await existingUser.update({
        first_name,
        last_name,
        phone_number,
        password: hashedPassword,
        is_deleted: false,
      });
      newUser = existingUser;
    } else {
      // Create new user
      newUser = await user.create({
        first_name,
        last_name,
        email,
        password: hashedPassword,
        phone_number,
      });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { user_id: newUser.user_id },
      process.env.AUTH_SECRET || "secretEncryptionKey",
      { expiresIn: "1h" }
    );

    // Append token to response
    const userWithToken = {
      ...newUser.toJSON(),
      token,
    };

    res.status(existingUser ? 200 : 201).json({
      result_code: 1,
      message: existingUser
        ? "User reactivated and registered successfully"
        : "User registered successfully",
      user: userWithToken,
    });

  } catch (err) {
    console.error("Error registering user:", err);
    return next(err);
  }
};

// User Login
exports.loginUser = async (req, res, next) => {
  try {

    console.log("Login request body:", req.body); // Debugging log
    const { email, password } = req.body;
    const foundUser = await user.findOne({ where: { email } });
    if (!foundUser || foundUser.is_deleted) {
      // Check if user is deleted
      return res
        .status(401)
        .json({
          result_code: 0,
          message: "Invalid credentials or user deleted.",
        });
    }
    const isMatch = await bcrypt.compare(password, foundUser.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ result_code: 0, message: "Invalid credentials." });
    }
    const token = jwt.sign(
      { user_id: foundUser.user_id },
      process.env.AUTH_SECRET || "secretEncryptionKey",
      { expiresIn: "1h" }
    );
    // Include token in the user object
    const userWithToken = {
      ...foundUser.toJSON(),
      token,
    };

    res
      .status(200)
      .json({
        result_code: 1,
        message: "Login successful",
        user: userWithToken,
      });
  } catch (err) {
    console.error("Error logging in user:", err);
    return next(err);
  }
};


// forgot password, reset password, change password, delete account, etc. can be added here in the future as needed.


exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ result_code: 0, message: "Email is required." });
    }
    const foundUser = await user.findOne({ where: { email } });
    if (!foundUser || foundUser.is_deleted) {
      // Always respond with success to prevent email enumeration
      return res.status(200).json({
        result_code: 1,
        message: "If an account with that email exists, a reset link has been sent."
      });
    }

    // Generate a secure token
    const resetToken = crypto.randomBytes(32).toString("hex");
    // timestamp for token expiry (e.g., 1 hour from now)

    const resetTokenExpiry = Date.now() + 1000 * 60 * 60 // 1 hour from now

    console.log(`Generated reset token for ${email}: ${resetToken} (expires at ${new Date(resetTokenExpiry).toLocaleString()})`); // Debugging log

    // Save token and expiry to user (assume columns exist, otherwise add them)
    await foundUser.update({
      reset_password_token: resetToken,
      reset_password_expires: new Date(resetTokenExpiry)
    });

    // Construct reset link (replace with your frontend URL)
    const resetLink = `http://localhost:3000/reset-password?reset_token=${resetToken}&email=${encodeURIComponent(email)}`;

    // TODO: Send email here. For now, just log the link (mock email send)
    console.log(`Password reset link for ${email}: ${resetLink}`);

    return res.status(200).json({
      result_code: 1,
      message: resetLink
    });
  } catch (err) {
    console.error("Error in forgotPassword:", err);
    return next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ result_code: 0, message: "Email, token, and new password are required." });
    }

    const foundUser = await user.findOne({ where: { email, reset_password_token: token } });
    console.log(`foundUser ${foundUser ? foundUser.toJSON() : null} `); // Debugging log

    if (!foundUser || foundUser.is_deleted) {
      return res.status(400).json({ result_code: 0, message: "Invalid or expired reset token." });
    }


    // Check if token is expired
    if (!foundUser.reset_password_expires || new Date(foundUser.reset_password_expires) < new Date()) {
      return res.status(400).json({ result_code: 0, message: "Reset token has expired." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear reset token/expiry
    await foundUser.update({
      password: hashedPassword,
      reset_password_token: null,
      reset_password_expires: null
    });

    return res.status(200).json({
      result_code: 1,
      message: "Password has been reset successfully."
    });
  } catch (err) {
    console.error("Error in resetPassword:", err);
    return next(err);
  }
};

// update user profile, change password, delete account, etc. can be added here in the future as needed.

exports.updateUserProfile = async (req, res, next) => {
  try {
    const { id } = req.user ? req.user : req.params; // Support both body and params for user ID
    const { first_name, last_name, phone_number,user_type } = req.body;
    const foundUser = await user.findOne({ where: { user_id: id, is_deleted: false } });
    if (!foundUser) {
      return res.status(404).json({ result_code: 0, message: "User not found." });
    }
    await foundUser.update({ first_name, last_name, phone_number,user_type });
    return res.status(200).json({ result_code: 1, message: "User profile updated successfully.", user: foundUser });
  } catch (err) {
    console.error("Error updating user profile:", err);
    return next(err);
  }
}
/// change password, delete account, etc. can be added here in the future as needed.
exports.changePassword = async (req, res, next) => {
    try {
        const { id } = req.user ? req.user : req.params; // Support both body and params for user ID
        const { current_password, new_password } = req.body;
        const foundUser = await user.findOne({ where: { user_id: id, is_deleted: false } });
        if (!foundUser) {
            return res.status(404).json({ result_code: 0, message: "User not found." });
        }
        const isMatch = await bcrypt.compare(current_password, foundUser.password);
        if (!isMatch) {
            return res.status(401).json({ result_code: 0, message: "Current password is incorrect." });
        } 
        const hashedNewPassword = await bcrypt.hash(new_password, 10);
        await foundUser.update({ password: hashedNewPassword });
        return res.status(200).json({ result_code: 1, message: "Password changed successfully." });
    } catch (err) {      
        console.error("Error changing password:", err);
        return next(err); 
    }
  }
  // delete account, etc. can be added here in the future as needed.
exports.deleteAccount = async (req, res, next) => {
    try {        const { id } = req.user ? req.user : req.params; // Support both body and params for user ID
        const foundUser = await user.findOne({ where: { user_id: id, is_deleted: false } });
        if (!foundUser) {
            return res.status(404).json({ result_code: 0, message: "User not found." });
        }
        await foundUser.update({ is_deleted: true });
        return res.status(200).json({ result_code: 1, message: "Account deleted successfully." });
    } catch (err) {
        console.error("Error deleting account:", err);
        return next(err);
    }
}



// Upload profile photo
exports.uploadProfilePhoto = async (req, res, next) => {
  try {
    const userId = req.user.id; // From auth middleware
    const foundUser = await user.findByPk(userId);
    
    if (!foundUser || foundUser.is_deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

     const uploadDir = path.join(__dirname, '../uploads/profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Delete old profile photo if it exists
    if (foundUser.profile_photo) {
      const oldPhotoPath = path.join(__dirname, '..', foundUser.profile_photo);
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath);
      }
    }

    // Save new photo path in database (store relative path)
    const photoUrl = `/uploads/profiles/${req.file.filename}`;
    // add base path to photoUrl if you want to return full URL

    
    foundUser.profile_photo = photoUrl;
    await foundUser.save();
    await foundUser.update({ profile_photo: photoUrl });

    return res.status(200).json({
      result_code: 1,
      message: 'Profile photo uploaded successfully',
      profile_photo: photoUrl
    });
  } catch (err) {
    console.error('Error uploading profile photo:', err);
    return next(err);
  }
};

// Remove profile photo
exports.removeProfilePhoto = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const foundUser = await user.findByPk(userId);
    
    if (!foundUser || foundUser.is_deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete the file if it exists
    if (foundUser.profile_photo) {
      const photoPath = path.join(__dirname, '..', foundUser.profile_photo);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }

    // Remove from database
    foundUser.profile_photo = null;
    await foundUser.save();

    return res.status(200).json({
      result_code: 1,
      message: 'Profile photo removed successfully'
    });
  } catch (err) {
    console.error('Error removing profile photo:', err);
    return next(err);
  }
};
