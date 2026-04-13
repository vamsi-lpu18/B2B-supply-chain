using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Order.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SyncModel_20260411 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Orders_DealerId_PlacedAtUtc",
                table: "Orders",
                columns: new[] { "DealerId", "PlacedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_Status_PlacedAtUtc",
                table: "Orders",
                columns: new[] { "Status", "PlacedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Orders_DealerId_PlacedAtUtc",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_Status_PlacedAtUtc",
                table: "Orders");
        }
    }
}
