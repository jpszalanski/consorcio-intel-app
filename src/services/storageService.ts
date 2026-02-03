
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

// Folder structure: raw-uploads/{YYYY-MM-DD}/{original_filename}
const getStoragePath = (fileName: string): string => {
    const date = new Date().toISOString().split('T')[0];
    return `raw-uploads/${date}/${fileName}`;
};

export const uploadFileToStorage = async (
    file: File,
    onProgress?: (progress: number) => void
): Promise<{ downloadUrl: string, storagePath: string }> => {

    const formattedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = getStoragePath(formattedName);
    const storageRef = ref(storage, storagePath);

    const metadata = {
        contentType: file.type || 'text/csv',
        customMetadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
            size: file.size.toString()
        }
    };

    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

    return new Promise((resolve, reject) => {
        uploadTask.on(
            'state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                if (onProgress) onProgress(progress);
            },
            (error) => {
                console.error("Upload failed", error);
                reject(error);
            },
            async () => {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve({ downloadUrl, storagePath });
            }
        );
    });
};
