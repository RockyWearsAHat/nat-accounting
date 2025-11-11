import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkGridFS() {
    try {
        console.log('🔍 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI as string);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        // Use mongoose's mongodb GridFSBucket (not standalone mongodb package)
        const { GridFSBucket } = mongoose.mongo;

        // Check collections
        console.log('\n📋 Checking collections...');
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        console.log('Available collections:', collectionNames);

        const hasFilesCollection = collectionNames.includes('documents.files');
        const hasChunksCollection = collectionNames.includes('documents.chunks');

        console.log('documents.files exists:', hasFilesCollection);
        console.log('documents.chunks exists:', hasChunksCollection);

        // Check indexes on documents.chunks
        if (hasChunksCollection) {
            console.log('\n🔍 Checking indexes on documents.chunks...');
            const chunksIndexes = await db.collection('documents.chunks').indexes();
            console.log('documents.chunks indexes:', JSON.stringify(chunksIndexes, null, 2));
        }

        // Check indexes on documents.files
        if (hasFilesCollection) {
            console.log('\n🔍 Checking indexes on documents.files...');
            const filesIndexes = await db.collection('documents.files').indexes();
            console.log('documents.files indexes:', JSON.stringify(filesIndexes, null, 2));
        }

        // Try to create indexes if they don't exist
        if (!hasChunksCollection || !hasFilesCollection) {
            console.log('\n⚠️ GridFS collections do not exist. Creating them with proper indexes...');

            // Create bucket to trigger collection creation
            const bucket = new GridFSBucket(db, { bucketName: 'documents' });
            console.log('✅ GridFS bucket created');

            // Create chunks index
            await db.collection('documents.chunks').createIndex(
                { files_id: 1, n: 1 },
                { unique: true }
            );
            console.log('✅ Created compound index on documents.chunks: { files_id: 1, n: 1 }');

            // Create files index
            await db.collection('documents.files').createIndex(
                { filename: 1, uploadDate: 1 }
            );
            console.log('✅ Created index on documents.files: { filename: 1, uploadDate: 1 }');
        }

        // Test upload
        console.log('\n🧪 Testing GridFS upload...');
        const bucket = new GridFSBucket(db, { bucketName: 'documents' });
        const testData = Buffer.from('Hello, GridFS!');

        const uploadStream = bucket.openUploadStream('test-file.txt', {
            metadata: { test: true }
        });

        await new Promise<void>((resolve, reject) => {
            uploadStream.on('finish', () => {
                console.log('✅ Test upload successful! File ID:', uploadStream.id);
                resolve();
            });

            uploadStream.on('error', (error) => {
                console.error('❌ Test upload failed:', error);
                reject(error);
            });

            uploadStream.write(testData);
            uploadStream.end();
        });

        // Clean up test file
        await bucket.delete(uploadStream.id);
        console.log('✅ Test file cleaned up');

        console.log('\n✅ All checks passed! GridFS is configured correctly.');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
        process.exit(0);
    }
}

checkGridFS();
