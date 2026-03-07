"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Trash2,
  Star,
  Loader2,
  Upload,
  ImageIcon,
  PanelTop,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import type { EventImage } from "@/types/database";

type Props = {
  eventId: string;
};

const IMAGE_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Star; className: string }
> = {
  cover: {
    label: "Cover",
    icon: Star,
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  banner: {
    label: "Banner",
    icon: PanelTop,
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  gallery: {
    label: "Gallery",
    icon: LayoutGrid,
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
};

export function EventImageManager({ eventId }: Props) {
  const [images, setImages] = useState<EventImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/images`);
      if (res.ok) {
        setImages(await res.json());
      }
    } catch {
      toast.error("Failed to load images");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  async function handleUpload(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    let successCount = 0;

    for (const file of fileArray) {
      const formData = new FormData();
      formData.append("file", file);
      // First image defaults to cover if none exists
      const hasCover = images.some((img) => img.image_type === "cover");
      formData.append("image_type", !hasCover && successCount === 0 ? "cover" : "gallery");
      formData.append("alt_text", file.name.replace(/\.[^.]+$/, ""));

      try {
        const res = await fetch(`/api/admin/events/${eventId}/images`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          successCount++;
        } else {
          const data = await res.json();
          toast.error(data.error || `Failed to upload ${file.name}`);
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    if (successCount > 0) {
      toast.success(
        `${successCount} image${successCount > 1 ? "s" : ""} uploaded`
      );
      fetchImages();
    }

    setUploading(false);
  }

  async function handleSetType(imageId: string, imageType: string) {
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/images/${imageId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_type: imageType }),
        }
      );

      if (res.ok) {
        toast.success(`Image set as ${imageType}`);
        fetchImages();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update image");
      }
    } catch {
      toast.error("Failed to update image");
    }
  }

  async function handleUpdateAlt(imageId: string, altText: string) {
    try {
      await fetch(`/api/admin/events/${eventId}/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt_text: altText }),
      });
    } catch {
      // Silent — best effort
    }
  }

  async function handleDelete(imageId: string) {
    if (!confirm("Delete this image? This cannot be undone.")) return;

    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/images/${imageId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        toast.success("Image deleted");
        setImages((prev) => prev.filter((img) => img.id !== imageId));
      } else {
        toast.error("Failed to delete image");
      }
    } catch {
      toast.error("Failed to delete image");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }

  const coverImage = images.find((img) => img.image_type === "cover");

  return (
    <Card className="shadow-brand-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-brand-teal" />
          Event Photos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cover photo preview */}
        {coverImage && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Cover Photo
            </Label>
            <div className="relative aspect-[21/9] rounded-xl overflow-hidden bg-muted border border-border/60">
              <Image
                src={coverImage.url}
                alt={coverImage.alt_text || "Event cover"}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute top-2 left-2">
                <Badge className={IMAGE_TYPE_CONFIG.cover.className}>
                  <Star className="h-3 w-3 mr-1" />
                  Cover
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Upload zone with transparent file input overlay */}
        <div
          className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          {/* Transparent file input covers entire zone */}
          {!uploading && (
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer"
              onChange={(e) => {
                if (e.target.files) handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
          )}
          <div className="space-y-3">
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    Drag & drop images or{" "}
                    <span className="text-primary hover:underline">
                      browse files
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG, WebP, GIF — max 5MB each
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Image grid */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : images.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No images uploaded yet. Add photos to make your event stand out.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => {
              const typeConfig = IMAGE_TYPE_CONFIG[img.image_type] || IMAGE_TYPE_CONFIG.gallery;

              return (
                <div
                  key={img.id}
                  className="group relative rounded-lg border border-border/60 overflow-hidden bg-muted/30"
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={img.url}
                      alt={img.alt_text || "Event image"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />

                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      {img.image_type !== "cover" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 text-xs"
                          onClick={() => handleSetType(img.id, "cover")}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          Set Cover
                        </Button>
                      )}
                      {img.image_type !== "banner" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 text-xs"
                          onClick={() => handleSetType(img.id, "banner")}
                        >
                          <PanelTop className="h-3 w-3 mr-1" />
                          Banner
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs"
                        onClick={() => handleDelete(img.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${typeConfig.className}`}
                      >
                        {typeConfig.label}
                      </Badge>
                      {img.file_size && (
                        <span className="text-[10px] text-muted-foreground">
                          {(img.file_size / 1024).toFixed(0)} KB
                        </span>
                      )}
                    </div>
                    <Input
                      placeholder="Alt text"
                      defaultValue={img.alt_text || ""}
                      className="h-7 text-xs"
                      onBlur={(e) => handleUpdateAlt(img.id, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
