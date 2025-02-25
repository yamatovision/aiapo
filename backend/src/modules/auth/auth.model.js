import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ClientIdGenerator } from '../utils/client-id-generator.js';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  name: {  // 追加
    type: String,
  },
  password: String,
  clientId: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: function(v) {
        return ClientIdGenerator.validateClientId(v);
      },
      message: props => `${props.value} は無効なクライアントIDです`
    }
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
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// 既存のパスワード関連のメソッド
UserSchema.methods.verifyPassword = async function(password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

// 既存のユーザーステータス関連のメソッド
UserSchema.methods.canLogin = function() {
  return this.status === 'active' && this.role !== 'none';
};

UserSchema.methods.isWithdrawn = function() {
  return this.status === 'withdrawn' || this.userRank === '退会者';
};

// 既存のuserRankに基づくroleとstatus設定メソッド
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

// 既存のセーフオブジェクト変換メソッド
UserSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// 新規追加: パスワードハッシュ化のpre-saveフック
UserSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// 新規追加: 新規ユーザー作成の静的メソッド
UserSchema.statics.createNewUser = async function(userData, createdBy) {
  try {
    // クライアントIDが指定されていない場合は自動生成
    if (!userData.clientId) {
      userData.clientId = await ClientIdGenerator.generateClientId(this);
    }

    // 作成者情報の追加
    const newUserData = {
      ...userData,
      createdBy: createdBy?._id
    };

    // ユーザーの作成
    const user = new this(newUserData);
    await user.save();

    return user;
  } catch (error) {
    console.error('ユーザー作成エラー:', error);
    throw error;
  }
};

// 新規追加: クライアントID検証の静的メソッド
UserSchema.statics.validateClientId = async function(clientId) {
  // クライアントIDの重複チェック
  const existingUser = await this.findOne({ clientId });
  if (existingUser) {
    return false;
  }
  
  // クライアントIDのフォーマット検証
  return ClientIdGenerator.validateClientId(clientId);
};

const User = mongoose.model('User', UserSchema);

export default User;