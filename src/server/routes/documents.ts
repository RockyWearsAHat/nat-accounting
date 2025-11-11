import { Router, Request } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { Readable } from "stream";
import FolderModel from "../models/Folder.js";

const router = Router();

// Use mongoose's mongodb GridFSBucket (not standalone mongodb package)
const { GridFSBucket, ObjectId } = mongoose.mongo;

// Configure multer for memory storage (we'll stream to GridFS)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req: any, file: any, cb: any) => {
        // Allow common document types
        const allowedMimeTypes = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "image/jpeg",
            "image/png",
            "image/gif",
            "text/plain",
            "text/csv",
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only documents and images allowed."));
        }
    },
});

// Helper function to get GridFS bucket
function getGridFSBucket(): InstanceType<typeof GridFSBucket> {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error("Database connection not established");
    }
    return new GridFSBucket(db, { bucketName: "documents" });
}

// Helper function to upload buffer to GridFS with proper promise handling
function uploadToGridFS(
    bucket: InstanceType<typeof GridFSBucket>,
    buffer: Buffer,
    filename: string,
    metadata: any
): Promise<InstanceType<typeof ObjectId>> {
    return new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(filename, { metadata });
        const readableStream = Readable.from(buffer);

        uploadStream.on("finish", () => {
            console.log("[Documents] Upload finished, fileId:", uploadStream.id);
            resolve(uploadStream.id);
        });

        uploadStream.on("error", (error: Error) => {
            console.error("[Documents] Upload stream error:", error);
            reject(error);
        });

        readableStream.on("error", (error: Error) => {
            console.error("[Documents] Readable stream error:", error);
            reject(error);
        });

        readableStream.pipe(uploadStream);
    });
}

// Upload document
router.post("/upload", requireAuth, upload.single("file"), async (req: any, res) => {
    console.log("[Documents] Upload request received");
    try {
        if (!req.file) {
            console.log("[Documents] No file in request");
            return res.status(400).json({ error: "No file uploaded" });
        }

        console.log("[Documents] File received:", req.file.originalname, req.file.size, "bytes");
        const userId = req.user!.id;
        const description = req.body.description || "";
        const folder = req.body.folder || null;
        const folderColor = req.body.folderColor || null;

        // Check if mongoose is connected
        if (!mongoose.connection.db) {
            console.error("[Documents] MongoDB not connected!");
            return res.status(500).json({ error: "Database not connected" });
        }

        console.log("[Documents] MongoDB connection state:", mongoose.connection.readyState);

        const bucket = getGridFSBucket();
        console.log("[Documents] GridFS bucket initialized");

        const metadata = {
            userId,
            uploadedBy: req.user!.email,
            description,
            contentType: req.file.mimetype,
            folder: folder,
            folderColor: folderColor,
        };

        console.log("[Documents] Starting GridFS upload with metadata:", metadata);

        // Upload with timeout protection
        const uploadPromise = uploadToGridFS(bucket, req.file.buffer, req.file.originalname, metadata);
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Upload timeout after 30 seconds")), 30000);
        });

        const fileId = await Promise.race([uploadPromise, timeoutPromise]);

        console.log("[Documents] Upload completed successfully, fileId:", fileId);
        res.json({
            success: true,
            fileId: fileId.toString(),
            filename: req.file.originalname,
        });

    } catch (error: any) {
        console.error("[Documents] Upload error:", error);
        if (!res.headersSent) {
            res.status(500).json({
                error: error.message || "Failed to upload document"
            });
        }
    }
});

// List user's documents
router.get("/", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const isAdmin = req.user!.role === "admin";
        const bucket = getGridFSBucket();

        // Query: admin can see all, users only see their own
        const query = isAdmin ? {} : { "metadata.userId": userId };

        const files = await bucket
            .find(query)
            .sort({ uploadDate: -1 })
            .toArray();

        const documents = files.map((file: any) => ({
            _id: file._id.toString(),
            filename: file.filename,
            uploadDate: file.uploadDate,
            length: file.length,
            contentType: file.metadata?.contentType || "application/octet-stream",
            folder: file.metadata?.folder || null,
            folderColor: file.metadata?.folderColor || null,
            metadata: {
                userId: file.metadata?.userId || "",
                uploadedBy: file.metadata?.uploadedBy || "",
                description: file.metadata?.description || "",
            },
        }));

        res.json(documents);
    } catch (error) {
        console.error("Failed to list documents:", error);
        res.status(500).json({ error: "Failed to retrieve documents" });
    }
});

// ===== SPECIFIC ROUTES (must come BEFORE parametric /:id route) =====

// Admin-only: Get list of all users with document counts (no documents data)
router.get("/admin/users", requireAuth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user!.role !== "admin") {
            return res.status(403).json({ error: "Admin access required" });
        }

        const bucket = getGridFSBucket();

        // Get all files from GridFS (just metadata)
        const files = await bucket
            .find({})
            .project({ "metadata.userId": 1 })
            .toArray();

        // Get all users
        const User = mongoose.model("User");
        const users = await User.find({}).select("_id email company").lean();

        // Create a map of userId to user info
        const userMap = new Map(
            users.map((u: any) => [u._id.toString(), { email: u.email, company: u.company }])
        );

        // Count documents per user
        const docCountMap = new Map<string, number>();
        for (const file of files) {
            const userId = file.metadata?.userId;
            if (!userId) continue;
            docCountMap.set(userId, (docCountMap.get(userId) || 0) + 1);
        }

        // Build response with user info and doc counts
        const result = Array.from(userMap.entries())
            .filter(([userId]) => docCountMap.has(userId)) // Only users with documents
            .map(([userId, userInfo]) => ({
                userId,
                email: userInfo.email,
                company: userInfo.company || null,
                displayName: userInfo.company || userInfo.email,
                documentCount: docCountMap.get(userId) || 0,
            }))
            .sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

        res.json(result);
    } catch (error) {
        console.error("Failed to get users with documents:", error);
        res.status(500).json({ error: "Failed to retrieve users" });
    }
});

// Admin-only: Get documents for a specific user
router.get("/admin/user/:userId", requireAuth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user!.role !== "admin") {
            return res.status(403).json({ error: "Admin access required" });
        }

        const { userId } = req.params;
        const bucket = getGridFSBucket();

        // Get user info
        const User = mongoose.model("User");
        const user = await User.findById(userId).select("email company").lean() as any;

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Get files for this user
        const files = await bucket
            .find({ "metadata.userId": userId })
            .sort({ uploadDate: -1 })
            .toArray();

        const documents = files.map((file: any) => ({
            _id: file._id.toString(),
            filename: file.filename,
            uploadDate: file.uploadDate,
            length: file.length,
            contentType: file.metadata?.contentType || "application/octet-stream",
            description: file.metadata?.description || "",
            uploadedBy: file.metadata?.uploadedBy || "",
            folder: file.metadata?.folder || null,
            folderColor: file.metadata?.folderColor || null,
        }));

        res.json({
            userId,
            email: user.email,
            company: user.company || null,
            displayName: user.company || user.email,
            documents,
        });
    } catch (error) {
        console.error("Failed to get user documents:", error);
        res.status(500).json({ error: "Failed to retrieve documents" });
    }
});

// Admin-only: Get all documents organized by user (deprecated - kept for backwards compatibility)
router.get("/admin/all", requireAuth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user!.role !== "admin") {
            return res.status(403).json({ error: "Admin access required" });
        }

        const bucket = getGridFSBucket();

        // Get all files from GridFS
        const files = await bucket
            .find({})
            .sort({ uploadDate: -1 })
            .toArray();

        // Get all users to map userId to user details
        const User = mongoose.model("User");
        const users = await User.find({}).select("_id email company").lean();

        // Create a map of userId to user info
        const userMap = new Map(
            users.map((u: any) => [u._id.toString(), { email: u.email, company: u.company }])
        );

        // Group files by user
        const groupedByUser = new Map<string, any>();

        for (const file of files) {
            const userId = file.metadata?.userId;
            if (!userId) continue;

            const userInfo = userMap.get(userId) || { email: "Unknown", company: null };
            const userKey = userId;

            if (!groupedByUser.has(userKey)) {
                groupedByUser.set(userKey, {
                    userId,
                    email: userInfo.email,
                    company: userInfo.company || null,
                    displayName: userInfo.company || userInfo.email,
                    documents: [],
                });
            }

            groupedByUser.get(userKey)!.documents.push({
                _id: file._id.toString(),
                filename: file.filename,
                uploadDate: file.uploadDate,
                length: file.length,
                contentType: file.metadata?.contentType || "application/octet-stream",
                description: file.metadata?.description || "",
                uploadedBy: file.metadata?.uploadedBy || "",
            });
        }

        // Convert map to array and sort by display name
        const result = Array.from(groupedByUser.values()).sort((a, b) => {
            const nameA = a.displayName.toLowerCase();
            const nameB = b.displayName.toLowerCase();
            return nameA.localeCompare(nameB);
        });

        res.json(result);
    } catch (error) {
        console.error("Failed to get all documents:", error);
        res.status(500).json({ error: "Failed to retrieve documents" });
    }
});

// Get folders for a user
router.get("/folders", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const isAdmin = req.user!.role === "admin";
        const bucket = getGridFSBucket();

        // For admin, get target userId from query param
        const targetUserId = isAdmin && req.query.userId ? req.query.userId as string : userId;

        // Access control for non-admins
        if (!isAdmin && targetUserId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Get all defined folders from Folder model
        const definedFolders = await FolderModel.find({ userId: targetUserId }).lean();

        // Get all files for the user
        const files = await bucket
            .find({ "metadata.userId": targetUserId })
            .toArray();

        // Extract folders from file metadata and count files per folder
        const foldersMap = new Map<string, { name: string; color: string; count: number }>();

        // First, add all defined folders (even if empty)
        for (const folder of definedFolders) {
            foldersMap.set(folder.name, {
                name: folder.name,
                color: folder.color,
                count: 0,
            });
        }

        // Then, add/update folders from file metadata and count files
        for (const file of files) {
            const folderName = file.metadata?.folder;
            if (folderName) {
                if (!foldersMap.has(folderName)) {
                    // Folder exists in files but not in Folder model - add it
                    foldersMap.set(folderName, {
                        name: folderName,
                        color: file.metadata?.folderColor || "#4a9eff",
                        count: 0,
                    });
                }
                foldersMap.get(folderName)!.count++;
            }
        }

        const folders = Array.from(foldersMap.values()).sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );

        res.json(folders);
    } catch (error) {
        console.error("Get folders error:", error);
        res.status(500).json({ error: "Failed to retrieve folders" });
    }
});

// Move files to a folder or update folder
router.post("/folder/move", requireAuth, async (req, res) => {
    try {
        const { fileIds, folder, folderColor } = req.body;
        const userId = req.user!.id;
        const isAdmin = req.user!.role === "admin";
        const bucket = getGridFSBucket();

        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({ error: "fileIds array is required" });
        }

        // If folder name is provided, ensure it exists in Folder model
        if (folder) {
            await FolderModel.findOneAndUpdate(
                { userId, name: folder },
                {
                    userId,
                    name: folder,
                    color: folderColor || "#4a9eff"
                },
                { upsert: true, new: true }
            );
        }

        // Update each file's metadata
        const updatePromises = fileIds.map(async (fileIdStr: string) => {
            const fileId = new ObjectId(fileIdStr);
            const files = await bucket.find({ _id: fileId }).toArray();

            if (files.length === 0) return { success: false, fileId: fileIdStr, error: "Not found" };

            const file = files[0];

            // Access control: users can only move their own files, admins can move any
            if (!isAdmin && file.metadata?.userId !== userId) {
                return { success: false, fileId: fileIdStr, error: "Access denied" };
            }

            // Download file data
            const chunks: Buffer[] = [];
            const downloadStream = bucket.openDownloadStream(fileId);

            await new Promise<void>((resolve, reject) => {
                downloadStream.on('data', (chunk) => chunks.push(chunk));
                downloadStream.on('end', () => resolve());
                downloadStream.on('error', reject);
            });

            const fileBuffer = Buffer.concat(chunks);

            // Delete old file
            await bucket.delete(fileId);

            // Re-upload with updated metadata
            const updatedMetadata = {
                ...file.metadata,
                folder: folder || null,
                folderColor: folderColor || null,
            };

            await uploadToGridFS(bucket, fileBuffer, file.filename, updatedMetadata);

            return { success: true, fileId: fileIdStr };
        });

        const results = await Promise.all(updatePromises);
        const failures = results.filter(r => !r.success);

        if (failures.length > 0) {
            return res.status(207).json({
                message: "Some files failed to move",
                results
            });
        }

        res.json({ success: true, message: "Files moved successfully" });
    } catch (error) {
        console.error("Move to folder error:", error);
        res.status(500).json({ error: "Failed to move files" });
    }
});

// Create an empty folder
router.post("/folder/create", requireAuth, async (req, res) => {
    try {
        const { name, color } = req.body;
        const userId = req.user!.id;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Folder name is required" });
        }

        // Create folder in Folder model
        const folder = await FolderModel.findOneAndUpdate(
            { userId, name: name.trim() },
            {
                userId,
                name: name.trim(),
                color: color || "#4a9eff"
            },
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            folder: {
                name: folder.name,
                color: folder.color,
                count: 0
            }
        });
    } catch (error: any) {
        console.error("Create folder error:", error);
        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({ error: "Folder already exists" });
        }
        res.status(500).json({ error: "Failed to create folder" });
    }
});

// Rename folder
router.post("/folder/rename", requireAuth, async (req, res) => {
    try {
        const { oldName, newName } = req.body;
        const userId = req.user!.id;
        const isAdmin = req.user!.role === "admin";
        const bucket = getGridFSBucket();

        if (!oldName || !newName) {
            return res.status(400).json({ error: "oldName and newName are required" });
        }

        // Update folder in Folder model
        const folder = await FolderModel.findOne({ userId, name: oldName });
        if (folder) {
            folder.name = newName;
            await folder.save();
        }

        // Get all files in the folder
        const query = isAdmin && req.body.userId
            ? { "metadata.userId": req.body.userId, "metadata.folder": oldName }
            : { "metadata.userId": userId, "metadata.folder": oldName };

        const files = await bucket.find(query).toArray();

        // Update each file's metadata
        for (const file of files) {
            // Download file data
            const chunks: Buffer[] = [];
            const downloadStream = bucket.openDownloadStream(new ObjectId(file._id));

            await new Promise<void>((resolve, reject) => {
                downloadStream.on('data', (chunk) => chunks.push(chunk));
                downloadStream.on('end', () => resolve());
                downloadStream.on('error', reject);
            });

            const fileBuffer = Buffer.concat(chunks);

            // Delete old file
            await bucket.delete(new ObjectId(file._id));

            // Re-upload with updated metadata
            const updatedMetadata = {
                ...file.metadata,
                folder: newName,
            };

            await uploadToGridFS(bucket, fileBuffer, file.filename, updatedMetadata);
        }

        res.json({ success: true, message: `Renamed folder from "${oldName}" to "${newName}"`, filesUpdated: files.length });
    } catch (error) {
        console.error("Rename folder error:", error);
        res.status(500).json({ error: "Failed to rename folder" });
    }
});

// Delete folder (moves all files to root/no folder)
router.delete("/folder/:folderName", requireAuth, async (req, res) => {
    try {
        const { folderName } = req.params;
        const userId = req.user!.id;
        const isAdmin = req.user!.role === "admin";
        const bucket = getGridFSBucket();
        const targetUserId = isAdmin && req.query.userId ? req.query.userId as string : userId;

        // Access control
        if (!isAdmin && targetUserId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Delete folder from Folder model
        await FolderModel.deleteOne({ userId: targetUserId, name: folderName });

        // Get all files in the folder
        const files = await bucket.find({
            "metadata.userId": targetUserId,
            "metadata.folder": folderName
        }).toArray();

        // Remove folder from each file's metadata
        for (const file of files) {
            // Download file data
            const chunks: Buffer[] = [];
            const downloadStream = bucket.openDownloadStream(new ObjectId(file._id));

            await new Promise<void>((resolve, reject) => {
                downloadStream.on('data', (chunk) => chunks.push(chunk));
                downloadStream.on('end', () => resolve());
                downloadStream.on('error', reject);
            });

            const fileBuffer = Buffer.concat(chunks);

            // Delete old file
            await bucket.delete(new ObjectId(file._id));

            // Re-upload with updated metadata
            const updatedMetadata = {
                ...file.metadata,
                folder: null,
                folderColor: null,
            };

            await uploadToGridFS(bucket, fileBuffer, file.filename, updatedMetadata);
        }

        res.json({ success: true, message: `Deleted folder "${folderName}"`, filesUpdated: files.length });
    } catch (error) {
        console.error("Delete folder error:", error);
        res.status(500).json({ error: "Failed to delete folder" });
    }
});

// ===== PARAMETRIC ROUTES (must come AFTER specific routes) =====

// Download document
router.get("/:id", requireAuth, async (req, res) => {
    try {
        // Validate ObjectId format
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: "Invalid file ID format" });
        }

        const fileId = new ObjectId(req.params.id);
        const userId = req.user!.id;
        const isAdmin = req.user!.role === "admin";
        const bucket = getGridFSBucket();

        // Get file metadata first to check access
        const files = await bucket.find({ _id: fileId }).toArray();

        if (files.length === 0) {
            return res.status(404).json({ error: "File not found" });
        }

        const file = files[0];

        // Access control: users can only download their own files, admins can download any
        if (!isAdmin && file.metadata?.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Set response headers
        res.set({
            "Content-Type": file.metadata?.contentType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${file.filename}"`,
            "Content-Length": file.length,
        });

        // Stream file to response
        const downloadStream = bucket.openDownloadStream(fileId);
        downloadStream.pipe(res);

        downloadStream.on("error", (error: Error) => {
            console.error("Download stream error:", error);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to download file" });
            }
        });
    } catch (error) {
        console.error("Download error:", error);
        res.status(500).json({ error: "Failed to download document" });
    }
});

// Delete document
router.delete("/:id", requireAuth, async (req, res) => {
    try {
        // Validate ObjectId format
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: "Invalid file ID format" });
        }

        const fileId = new ObjectId(req.params.id);
        const userId = req.user!.id;
        const isAdmin = req.user!.role === "admin";
        const bucket = getGridFSBucket();

        // Get file metadata to check access
        const files = await bucket.find({ _id: fileId }).toArray();

        if (files.length === 0) {
            return res.status(404).json({ error: "File not found" });
        }

        const file = files[0];

        // Access control: users can only delete their own files, admins can delete any
        if (!isAdmin && file.metadata?.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Delete file from GridFS (this removes both metadata and chunks)
        await bucket.delete(fileId);

        res.json({ success: true, message: "Document deleted successfully" });
    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ error: "Failed to delete document" });
    }
});


export default router;
