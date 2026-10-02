alter table otp_challenges drop constraint otp_challenges_channel_check;
alter table otp_challenges add constraint otp_challenges_channel_check
  check (channel in ('SMS', 'EMAIL'));

alter table otp_challenges drop constraint otp_challenges_purpose_check;
alter table otp_challenges add constraint otp_challenges_purpose_check
  check (purpose in ('LOGIN_OR_SIGNUP', 'EMAIL_VERIFICATION'));
