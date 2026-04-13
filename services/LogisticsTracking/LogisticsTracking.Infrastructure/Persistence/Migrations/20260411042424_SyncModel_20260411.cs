using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LogisticsTracking.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SyncModel_20260411 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Shipments_AssignedAgentId_CreatedAtUtc",
                table: "Shipments",
                columns: new[] { "AssignedAgentId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Shipments_CreatedAtUtc",
                table: "Shipments",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Shipments_DealerId_CreatedAtUtc",
                table: "Shipments",
                columns: new[] { "DealerId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Shipments_AssignedAgentId_CreatedAtUtc",
                table: "Shipments");

            migrationBuilder.DropIndex(
                name: "IX_Shipments_CreatedAtUtc",
                table: "Shipments");

            migrationBuilder.DropIndex(
                name: "IX_Shipments_DealerId_CreatedAtUtc",
                table: "Shipments");
        }
    }
}
