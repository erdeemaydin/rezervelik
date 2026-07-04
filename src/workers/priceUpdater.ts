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
            // Explicit per-item prices scheduled from the bulk editor: apply the
            // stored target prices directly (only to items still in this tenant).
            if (update.updateType === 'EXPLICIT_SET') {
              const targets: { id: string; price: number }[] = update.payload ? JSON.parse(update.payload) : [];
              if (targets.length > 0) {
                const owned = await tx.menuItem.findMany({
                  where: { id: { in: targets.map(t => t.id) }, category: { menu: { restaurantId: update.restaurantId } } },
                  select: { id: true }
                });
                const ownedIds = new Set(owned.map(o => o.id));
                for (const target of targets) {
                  if (ownedIds.has(target.id) && !isNaN(target.price) && target.price >= 0) {
                    await tx.menuItem.update({ where: { id: target.id }, data: { price: Math.round(target.price * 100) / 100 } });
                  }
                }
              }
              await tx.scheduledPriceUpdate.update({
                where: { id: update.id },
                data: { status: 'APPLIED', appliedAt: new Date() }
              });
              console.log(`[Worker] Successfully applied explicit update ${update.id}`);
              return;
            }

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
