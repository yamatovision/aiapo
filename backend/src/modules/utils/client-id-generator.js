// utils/client-id-generator.js
export class ClientIdGenerator {
  static async generateClientId(User) {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substr(2, 5);
    const prefix = 'CL';
    const candidateId = `${prefix}${timestamp}${randomStr}`.toUpperCase();

    // 一意性チェック
    const existingUser = await User.findOne({ clientId: candidateId });
    if (existingUser) {
      // 衝突した場合は再生成
      return this.generateClientId(User);
    }

    return candidateId;
  }

  static validateClientId(clientId) {
    if (!clientId) return false;
    // CLで始まり、英数字のみで構成される文字列
    const clientIdPattern = /^CL[A-Z0-9]{10,}$/;
    return clientIdPattern.test(clientId);
  }
}