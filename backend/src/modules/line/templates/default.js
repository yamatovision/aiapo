// backend/src/modules/line/templates/default.js

export const defaultTemplates = [
  {
    name: '予約確認',
    type: 'confirmation',
    displayName: '予約確認',
    content: `予約を承りました。

【ご予約内容】
日時：{{date}} {{time}}
お名前：{{name}}
形式：Zoomによるオンライン相談

【Zoomミーティング情報】
以下のリンクから参加いただけます：
https://us02web.zoom.us/j/3041351966

【ご準備いただくこと】
・安定したインターネット接続環境
・現在の課題や目標についてのメモ
・ご質問事項（もしあれば）

ご不明な点がございましたら、お気軽にお申し付けください。`.trim(),
    isActive: true
  },
  {
    name: '24時間前リマインド',
    type: 'custom',
    reminderMinutes: 1440, // 24時間
    displayName: '24時間前',
    content: `明日のAI開発無料相談まで24時間となりました。

【ご予約内容】
日時：{{date}} {{time}}

【Zoomミーティング情報】
https://us02web.zoom.us/j/3041351966

【事前準備のお願い】
・Zoomアプリのインストール
・インターネット接続環境の確認
・ご質問事項の整理

よろしくお願いいたします。`.trim(),
    isActive: true
  },


{
  name: '自動返信メッセージ',
  type: 'instant',
  displayName: '即時返信',
  content: `メッセージありがとうございます。
予約システムに関するお問い合わせは、以下のリンクからご確認ください。
URL: {{booking_url}}

※ このメッセージは自動返信です。`,
  isActive: true
},

  {
    name: '30分前リマインド',
    type: 'custom',
    reminderMinutes: 30,
    displayName: '30分前',
    content: `まもなくAI開発無料相談の開始時刻となります。

【ご予約内容】
日時：{{date}} {{time}}（30分後に開始）

【Zoomミーティング情報】
https://us02web.zoom.us/j/3041351966

【最終確認】
✓ Zoomアプリの起動確認
✓ インターネット接続状態の確認
✓ マイク・カメラの動作確認

開始5分前までにご参加いただけますと幸いです。`.trim(),
    isActive: true
  }
];
