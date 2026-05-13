import { supabase } from "@/integrations/supabase/client";

export const r2Storage = {
  async getUploadUrl(fileName: string, contentType: string) {
    const { data, error } = await supabase.functions.invoke('r2-storage', {
      body: { action: 'get-upload-url', fileName, contentType },
    });
    if (error) throw error;
    return data.url as string;
  },

  async getDownloadUrl(fileName: string) {
    const { data, error } = await supabase.functions.invoke('r2-storage', {
      body: { action: 'get-download-url', fileName },
    });
    if (error) throw error;
    return data.url as string;
  },

  async deleteFile(fileName: string) {
    const { data, error } = await supabase.functions.invoke('r2-storage', {
      body: { action: 'delete', fileName },
    });
    if (error) throw error;
    return data.success as boolean;
  },

  async uploadFile(file: File | Blob, fileName: string) {
    const uploadUrl = await this.getUploadUrl(fileName, file.type);
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to R2: ${response.statusText}`);
    }

    // Return the URL for viewing the file
    // If you have a custom domain or a public bucket, you might want to return that instead
    // For now, we'll return a way to get a signed URL later or use the public R2 URL pattern if known
    return fileName;
  }
};