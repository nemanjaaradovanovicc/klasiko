-- Klasiko: kontakt mejl izdavaoca (platform_settings.email).
-- 002_billing.sql je već primenjen i ubacuje stari mejl; ovaj UPDATE menja vrednost u bazi.

update platform_settings
set email = 'klasiko.rs@gmail.com',
    updated_at = now()
where id = 1;
