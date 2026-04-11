/*
  Simple idempotent index patch for common query patterns.
  Safe to run multiple times.
*/

USE [IdentityAuthMigrationsDB];
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Users_Role_Status_CreatedAtUtc'
      AND object_id = OBJECT_ID('[dbo].[Users]')
)
BEGIN
    CREATE INDEX [IX_Users_Role_Status_CreatedAtUtc]
        ON [dbo].[Users]([Role], [Status], [CreatedAtUtc]);
END;
GO

USE [OrderMigrationsDB];
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Orders_DealerId_PlacedAtUtc'
      AND object_id = OBJECT_ID('[dbo].[Orders]')
)
BEGIN
    CREATE INDEX [IX_Orders_DealerId_PlacedAtUtc]
        ON [dbo].[Orders]([DealerId], [PlacedAtUtc]);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Orders_Status_PlacedAtUtc'
      AND object_id = OBJECT_ID('[dbo].[Orders]')
)
BEGIN
    CREATE INDEX [IX_Orders_Status_PlacedAtUtc]
        ON [dbo].[Orders]([Status], [PlacedAtUtc]);
END;
GO

USE [LogisticsTrackingMigrationsDB];
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Shipments_DealerId_CreatedAtUtc'
      AND object_id = OBJECT_ID('[dbo].[Shipments]')
)
BEGIN
    CREATE INDEX [IX_Shipments_DealerId_CreatedAtUtc]
        ON [dbo].[Shipments]([DealerId], [CreatedAtUtc]);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Shipments_AssignedAgentId_CreatedAtUtc'
      AND object_id = OBJECT_ID('[dbo].[Shipments]')
)
BEGIN
    CREATE INDEX [IX_Shipments_AssignedAgentId_CreatedAtUtc]
        ON [dbo].[Shipments]([AssignedAgentId], [CreatedAtUtc]);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Shipments_CreatedAtUtc'
      AND object_id = OBJECT_ID('[dbo].[Shipments]')
)
BEGIN
    CREATE INDEX [IX_Shipments_CreatedAtUtc]
        ON [dbo].[Shipments]([CreatedAtUtc]);
END;
GO

USE [PaymentInvoiceMigrationsDB];
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Invoices_DealerId_CreatedAtUtc'
      AND object_id = OBJECT_ID('[dbo].[Invoices]')
)
BEGIN
    CREATE INDEX [IX_Invoices_DealerId_CreatedAtUtc]
        ON [dbo].[Invoices]([DealerId], [CreatedAtUtc]);
END;
GO

USE [NotificationMigrationsDB];
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Notifications_RecipientUserId_CreatedAtUtc'
      AND object_id = OBJECT_ID('[dbo].[Notifications]')
)
BEGIN
    CREATE INDEX [IX_Notifications_RecipientUserId_CreatedAtUtc]
        ON [dbo].[Notifications]([RecipientUserId], [CreatedAtUtc]);
END;
GO
