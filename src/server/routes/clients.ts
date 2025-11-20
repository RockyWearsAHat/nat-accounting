import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ClientModel } from '../models/Client.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Configure multer for memory storage (store in buffer)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Only allow image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// GET /api/clients - Get all active clients (public)
router.get('/', async (req: Request, res: Response) => {
    try {
        const clients = await ClientModel.find({ isActive: true })
            .sort({ displayOrder: 1, name: 1 })
            .select('-logoData -logoContentType') // Don't send binary data in list
            .lean();

        res.json({ clients });
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

// GET /api/clients/:id/logo - Get client logo image
router.get('/:id/logo', async (req: Request, res: Response) => {
    try {
        const client = await ClientModel.findById(req.params.id).select('logoData logoContentType name');

        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        if (!client.logoData || !client.logoContentType) {
            return res.status(404).json({ error: 'Logo not found' });
        }

        res.set('Content-Type', client.logoContentType);
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        res.send(client.logoData);
    } catch (error) {
        console.error('Error fetching client logo:', error);
        res.status(500).json({ error: 'Failed to fetch logo' });
    }
});

// GET /api/clients/admin/all - Get all clients including inactive (admin only)
router.get('/admin/all', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const clients = await ClientModel.find()
            .sort({ displayOrder: 1, name: 1 })
            .select('-logoData') // Don't send binary data in list
            .lean();

        res.json({ clients });
    } catch (error) {
        console.error('Error fetching all clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

// POST /api/clients - Create new client (admin only)
router.post('/', requireAuth, requireAdmin, upload.single('logo'), async (req: Request, res: Response) => {
    try {
        const { name, website, color, displayOrder, isActive } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Client name is required' });
        }

        const clientData: any = {
            name,
            website: website || undefined,
            color: color || '#798C8C',
            displayOrder: displayOrder ? parseInt(displayOrder) : 0,
            isActive: isActive !== 'false'
        };

        // Handle logo upload
        if (req.file) {
            clientData.logoData = req.file.buffer;
            clientData.logoContentType = req.file.mimetype;
        }

        const client = new ClientModel(clientData);
        await client.save();

        // Return client without binary data
        const savedClient = await ClientModel.findById(client._id).select('-logoData').lean();
        res.status(201).json({ client: savedClient });
    } catch (error) {
        console.error('Error creating client:', error);
        res.status(500).json({ error: 'Failed to create client' });
    }
});

// PUT /api/clients/:id - Update client (admin only)
router.put('/:id', requireAuth, requireAdmin, upload.single('logo'), async (req: Request, res: Response) => {
    try {
        const { name, website, color, displayOrder, isActive } = req.body;

        const updateData: any = {};
        if (name) updateData.name = name;
        if (website !== undefined) updateData.website = website || undefined;
        if (color) updateData.color = color;
        if (displayOrder !== undefined) updateData.displayOrder = parseInt(displayOrder);
        if (isActive !== undefined) updateData.isActive = isActive !== 'false';

        // Handle logo upload
        if (req.file) {
            updateData.logoData = req.file.buffer;
            updateData.logoContentType = req.file.mimetype;
        }

        const client = await ClientModel.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-logoData').lean();

        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        res.json({ client });
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ error: 'Failed to update client' });
    }
});

// DELETE /api/clients/:id - Delete client (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const client = await ClientModel.findByIdAndDelete(req.params.id);

        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        res.json({ success: true, message: 'Client deleted successfully' });
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ error: 'Failed to delete client' });
    }
});

export default router;
