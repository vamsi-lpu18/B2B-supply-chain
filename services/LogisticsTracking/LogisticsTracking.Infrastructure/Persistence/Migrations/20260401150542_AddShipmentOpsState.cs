using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LogisticsTracking.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddShipmentOpsState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ShipmentOpsStates",
                columns: table => new
                {
                    ShipmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HandoverState = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    HandoverExceptionReason = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    RetryRequired = table.Column<bool>(type: "bit", nullable: false),
                    RetryCount = table.Column<int>(type: "int", nullable: false),
                    RetryReason = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    NextRetryAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastRetryScheduledAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShipmentOpsStates", x => x.ShipmentId);
                    table.ForeignKey(
                        name: "FK_ShipmentOpsStates_Shipments_ShipmentId",
                        column: x => x.ShipmentId,
                        principalTable: "Shipments",
                        principalColumn: "ShipmentId",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShipmentOpsStates");
        }
    }
}
