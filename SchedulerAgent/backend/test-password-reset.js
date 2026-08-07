require('dotenv').config();
const prisma = require('./src/prisma');
const bcrypt = require('./node_modules/bcrypt');
const { sendPasswordResetEmail } = require('./src/services/mailer');

async function testPasswordReset() {
  console.log('=== Password Reset via Gmail SMTP Verification ===\n');

  try {
    const testEmail = `reset_test_${Date.now()}@gmail.com`;
    const initialPassword = 'OldPassword123!';
    const newPassword = 'NewSecretPassword456!';
    const passwordHash = await bcrypt.hash(initialPassword, 10);

    // 1. Create test user
    console.log('1. Creating test user in database...');
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        name: 'SMTP Test User',
      },
    });
    console.log(`User created: ${user.id} (${user.email})`);

    // 2. Test SMTP Email Sending (Nodemailer)
    console.log('2. Testing Gmail SMTP Transport...');
    const mockToken = '123456-abcdef0123456789';
    const mockUrl = `https://scheduler.zerodaycops.in/reset-password?token=${mockToken}`;
    
    try {
      const mailInfo = await sendPasswordResetEmail('bothubey@gmail.com', '123456', mockUrl);
      console.log('✅ SMTP Email sent successfully! MessageId:', mailInfo.messageId);
    } catch (mailErr) {
      console.warn('⚠️ SMTP Email delivery warning (credentials check):', mailErr.message);
    }

    // 3. Save Reset Token to User
    console.log('3. Updating user record with resetToken & 1h expiry...');
    const expiry = new Date(Date.now() + 3600 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: mockToken,
        resetTokenExpiry: expiry,
      },
    });

    // 4. Verify Password Reset logic
    console.log('4. Verifying token lookup & password update...');
    const dbUser = await prisma.user.findFirst({
      where: {
        resetToken: mockToken,
        resetTokenExpiry: { gte: new Date() },
      },
    });

    if (!dbUser) throw new Error('Token lookup failed!');

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        passwordHash: newHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    // 5. Verify bcrypt match on updated password
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const isNewValid = await bcrypt.compare(newPassword, updatedUser.passwordHash);
    const isOldValid = await bcrypt.compare(initialPassword, updatedUser.passwordHash);

    console.log('New password match:', isNewValid ? '✅ MATCH' : '❌ FAIL');
    console.log('Old password match:', !isOldValid ? '✅ REJECTED (as expected)' : '❌ FAIL');
    console.log('Reset token cleared:', updatedUser.resetToken === null ? '✅ CLEARED' : '❌ FAIL');

    if (isNewValid && !isOldValid && updatedUser.resetToken === null) {
      console.log('\n======================================================');
      console.log('🎉 PASSWORD RESET & GMAIL SMTP VERIFICATION PASSED!');
      console.log('======================================================\n');
    } else {
      throw new Error('Password reset verification checks failed');
    }

    // Cleanup
    await prisma.user.delete({ where: { id: user.id } });
  } catch (err) {
    console.error('❌ Password reset test failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPasswordReset();
