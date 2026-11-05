/** Limite serveur : 4 Mo (les fonctions Vercel refusent les corps de requête > 4,5 Mo). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Erreur d'envoi de fichier dont le message est destiné à l'utilisateur. */
export class UploadError extends Error {}

/** Réduit une photo trop lourde (cas courant : photo ou capture de téléphone) avant l'envoi.
 *  Les PDF ne peuvent pas être réduits : on refuse s'ils dépassent la limite. */
export async function prepareUpload(file: File): Promise<File> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("That PDF is over 4 MB. Please send a screenshot or a smaller file.");
    return file;
  }
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 1.5 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new UploadError("Couldn't prepare that image. Please try another one.");
  ctx.fillStyle = "#fff"; // les PNG transparents deviennent opaques en JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.86, 0.72, 0.58]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) {
      return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  }
  throw new UploadError("That image is too large even after reducing it. Please choose a smaller one.");
}
