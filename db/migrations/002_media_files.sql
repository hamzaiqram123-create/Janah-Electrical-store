-- Uploaded images and videos kept in the database (STORAGE_DRIVER=db).
-- For hosts without a persistent disk (Render, Railway, Heroku-style platforms): files survive restarts and
-- redeploys, and they are included in every database backup.
CREATE TABLE media_files (
  key text PRIMARY KEY,
  content_type text NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
