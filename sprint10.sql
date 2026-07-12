-- =========================================================
-- SPRINT 10: FİRMA BİLGİLERİ
-- Run this whole file once in the Supabase SQL Editor.
--
-- No RLS changes needed — companies already has member-scoped
-- select/update policies from Sprint 0.
-- =========================================================

alter table companies add column if not exists ticari_unvan text;
alter table companies add column if not exists sektor text;
alter table companies add column if not exists adres text;
alter table companies add column if not exists ilce text;
alter table companies add column if not exists il text;
alter table companies add column if not exists telefon text;
alter table companies add column if not exists faks text;
alter table companies add column if not exists vergi_dairesi text;
alter table companies add column if not exists vergi_no text;
alter table companies add column if not exists mersis_no text;
alter table companies add column if not exists ticaret_sicil_no text;
