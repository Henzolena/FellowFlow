-- Event images table for dynamic photos (cover, gallery, banner) per event
CREATE TABLE IF NOT EXISTS event_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  image_type TEXT NOT NULL DEFAULT 'gallery' CHECK (image_type IN ('cover', 'gallery', 'banner')),
  display_order INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_images_event_id ON event_images (event_id, display_order);

-- Ensure only one cover image per event
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_cover_per_event
  ON event_images (event_id)
  WHERE image_type = 'cover';

ALTER TABLE event_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view event images"
  ON event_images FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage event images"
  ON event_images FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
