// ponytail: logs the raw OTP to console — same mocked-delivery exception as
// smsSender.ts. Replace with a real transactional email provider before launch.
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  console.log(`[mock email] to ${email}: your RetroMobi verification code is ${code}`);
}
