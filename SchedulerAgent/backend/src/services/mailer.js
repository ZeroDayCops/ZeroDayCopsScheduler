const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_PORT === '465', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

/**
 * Sends a password reset email to the user with a reset link and 6-digit OTP code.
 * @param {string} toEmail 
 * @param {string} resetToken 
 * @param {string} resetUrl 
 */
async function sendPasswordResetEmail(toEmail, resetToken, resetUrl) {
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER || 'zerodaycops@gmail.com';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
          .container { max-width: 560px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .logo { font-size: 22px; font-weight: bold; color: #6366f1; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 1px; }
          h2 { color: #ffffff; margin-top: 0; font-size: 20px; }
          p { color: #94a3b8; font-size: 15px; line-height: 1.6; }
          .btn { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff !important; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 20px 0; box-shadow: 0 4px 12px rgba(99,102,241,0.4); }
          .token-box { background-color: #0f172a; border: 1px dashed #6366f1; padding: 14px; text-align: center; border-radius: 8px; font-family: monospace; font-size: 22px; color: #38bdf8; letter-spacing: 4px; margin: 16px 0; }
          .footer { margin-top: 30px; border-top: 1px solid #334155; padding-top: 16px; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">⚡ ZeroDayCops Scheduler</div>
          <h2>Password Reset Request</h2>
          <p>We received a request to reset your password for your ZeroDayCops Scheduler account.</p>
          <p>You can reset your password by clicking the button below or using your security token:</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="btn">Reset Password</a>
          </div>

          <p>Or copy and paste this verification code into the password reset form:</p>
          <div class="token-box">${resetToken}</div>

          <p>This password reset link and code will expire in <strong>1 hour</strong>.</p>
          <p style="font-size: 13px; color: #64748b;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          
          <div class="footer">
            &copy; 2026 ZeroDayCops Scheduler. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;

  const info = await transporter.sendMail({
    from: `"ZeroDayCops Security" <${fromEmail}>`,
    to: toEmail,
    subject: '🔒 Reset Your Password — ZeroDayCops Scheduler',
    html: htmlContent,
  });

  console.log(`[SMTP MAILER] Password reset email sent to ${toEmail}. Message ID: ${info.messageId}`);
  return info;
}

module.exports = {
  transporter,
  sendPasswordResetEmail,
};
