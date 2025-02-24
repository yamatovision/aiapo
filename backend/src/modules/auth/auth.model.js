import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: String,
  clientId: {
    type: String,
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'none'],
    default: 'admin'
  },
  userRank: {
    type: String
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'withdrawn'],
    default: 'active'
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// パスワード関連のメソッド
UserSchema.methods.verifyPassword = async function(password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

// ユーザーステータス関連のメソッド
UserSchema.methods.canLogin = function() {
  return this.status === 'active' && this.role !== 'none';
};

UserSchema.methods.isWithdrawn = function() {
  return this.status === 'withdrawn' || this.userRank === '退会者';
};

// userRankに基づいてroleとstatusを設定するメソッド
UserSchema.methods.setRoleAndStatus = function() {
  if (this.userRank === '退会者') {
    this.status = 'withdrawn';
    this.role = 'none';
    return;
  }

  if (this.userRank === '管理者') {
    this.role = 'superadmin';
  } else if (this.userRank) {
    this.role = 'admin';
  }
  
  this.status = 'active';
};

// ユーザー情報を安全に返すメソッド（パスワードを除外）
UserSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const User = mongoose.model('User', UserSchema);

export default User;
