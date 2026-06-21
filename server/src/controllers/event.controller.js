const prisma = require('../lib/prisma');

exports.createEvent = async (req, res) => {
  try {
    const { title, location, event_date, venue_capacity, target_profit, target_sponsorship } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'User tidak terautentikasi.' });
    }

    const event = await prisma.event.create({
      data: {
        title,
        location,
        event_date: new Date(event_date),
        venue_capacity: Number(venue_capacity),
        target_profit: Number(target_profit),
        target_sponsorship: Number(target_sponsorship),
        promotor_id: req.user.id,
      },
    });

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    console.error('[CREATE EVENT ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
