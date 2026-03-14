/**
 * FreeType bridge for Vertz native text rendering.
 *
 * Wraps FreeType's complex struct-based API into flat FFI-friendly functions.
 * Compiled at runtime via Bun's cc() from bun:ffi.
 */

#include <ft2build.h>
#include FT_FREETYPE_H

static FT_Library ft_library = NULL;

/* Initialize FreeType. Returns 0 on success. */
int vt_ft_init(void) {
  if (ft_library) return 0;
  return FT_Init_FreeType(&ft_library);
}

/* Load a font face from a file path at the given pixel size. Returns face pointer or NULL. */
void* vt_ft_load_font(const char* path, int pixel_size) {
  if (!ft_library) return NULL;
  FT_Face face = NULL;
  int err = FT_New_Face(ft_library, path, 0, &face);
  if (err || !face) return NULL;
  FT_Set_Pixel_Sizes(face, 0, pixel_size);
  return (void*)face;
}

/* Free a font face. */
void vt_ft_free_font(void* face_ptr) {
  if (face_ptr) FT_Done_Face((FT_Face)face_ptr);
}

/* Get the line height (ascender - descender) in pixels. */
int vt_ft_line_height(void* face_ptr) {
  FT_Face face = (FT_Face)face_ptr;
  /* size->metrics values are in 26.6 fixed point */
  return (int)((face->size->metrics.ascender - face->size->metrics.descender) >> 6);
}

/* Get the ascender in pixels. */
int vt_ft_ascender(void* face_ptr) {
  FT_Face face = (FT_Face)face_ptr;
  return (int)(face->size->metrics.ascender >> 6);
}

/**
 * Render a single glyph and write its metrics to the output params.
 * Returns a pointer to the glyph bitmap buffer (valid until next glyph load),
 * or NULL on failure.
 *
 * out_width:    bitmap width in pixels
 * out_height:   bitmap rows in pixels
 * out_bearing_x: horizontal bearing (left edge offset from origin)
 * out_bearing_y: vertical bearing (top edge offset from baseline)
 * out_advance:  horizontal advance to next glyph (in pixels)
 * out_pitch:    bitmap row stride in bytes
 */
const unsigned char* vt_ft_render_glyph(
  void* face_ptr,
  unsigned int char_code,
  int* out_width,
  int* out_height,
  int* out_bearing_x,
  int* out_bearing_y,
  int* out_advance,
  int* out_pitch
) {
  FT_Face face = (FT_Face)face_ptr;
  FT_UInt glyph_index = FT_Get_Char_Index(face, char_code);
  if (glyph_index == 0) return NULL;

  int err = FT_Load_Glyph(face, glyph_index, FT_LOAD_RENDER);
  if (err) return NULL;

  FT_GlyphSlot slot = face->glyph;
  *out_width = (int)slot->bitmap.width;
  *out_height = (int)slot->bitmap.rows;
  *out_bearing_x = slot->bitmap_left;
  *out_bearing_y = slot->bitmap_top;
  *out_advance = (int)(slot->advance.x >> 6);
  *out_pitch = slot->bitmap.pitch;

  return slot->bitmap.buffer;
}

/**
 * Measure the width of a text string in pixels.
 * Does not render — just sums up advances.
 */
int vt_ft_measure_text(void* face_ptr, const char* text) {
  FT_Face face = (FT_Face)face_ptr;
  int width = 0;
  for (const char* p = text; *p; p++) {
    FT_UInt gi = FT_Get_Char_Index(face, (unsigned int)*p);
    if (FT_Load_Glyph(face, gi, FT_LOAD_DEFAULT) == 0) {
      width += (int)(face->glyph->advance.x >> 6);
    }
  }
  return width;
}

/* Shutdown FreeType. */
void vt_ft_shutdown(void) {
  if (ft_library) {
    FT_Done_FreeType(ft_library);
    ft_library = NULL;
  }
}
