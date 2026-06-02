import prisma from '../config/prisma';

export const startPriceUpdater = () => {
  console.log('[Worker] Scheduled Price Updater initialized. Checking every minute...');
  
  setInterval(async () => {
    try {
      const pendingUpdates = await prisma.scheduledPriceUpdate.findMany({
        where: {
          status: 'PENDING',
          scheduledFor: { lte: new Date() }
        }
      });

      if (pendingUpdates.length === 0) return;

      console.log(`[Worker] Found ${pendingUpdates.length} pending price updates. Processing...`);

      for (const update of pendingUpdates) {
        try {
          await prisma.$transaction(async (tx) => {
            const menuItems = await tx.menuItem.findMany({
              where: {
                category: {
                  menu: {
                    restaurantId: update.restaurantId
                  }
                }
              }
            });

            for (const item of menuItems) {
              let newPrice = item.price;
              
              if (update.updateType === 'PERCENTAGE') {
                const multiplier = update.value / 100;
                if (update.isIncrease) {
                  newPrice = item.price + (item.price * multiplier);
                } else {
                  newPrice = Math.max(0, item.price - (item.price * multiplier));
                }
              } else if (update.updateType === 'FIXED_AMOUNT') {
                if (update.isIncrease) {
                  newPrice = item.price + update.value;
                } else {
                  newPrice = Math.max(0, item.price - update.value);
                }
              }

              // Optional: Round to 2 decimal places
              newPrice = Math.round(newPrice * 100) / 100;

              if (newPrice !== item.price) {
                await tx.menuItem.update({
                  where: { id: item.id },
                  data: { price: newPrice }
                });
              }
            }

            await tx.scheduledPriceUpdate.update({
              where: { id: update.id },
              data: { status: 'APPLIED', appliedAt: new Date() }
            });
            
            console.log(`[Worker] Successfully applied update ${update.id}`);
          });
        } catch (txError) {
          console.error(`[Worker] Failed to apply update ${update.id}:`, txError);
          await prisma.scheduledPriceUpdate.update({
            where: { id: update.id },
            data: { status: 'FAILED', appliedAt: new Date() }
          });
        }
      }
    } catch (error) {
      console.error('[Worker] Fatal error in Price Updater loop:', error);
    }
  }, 60 * 1000); // Check every 60 seconds
};
