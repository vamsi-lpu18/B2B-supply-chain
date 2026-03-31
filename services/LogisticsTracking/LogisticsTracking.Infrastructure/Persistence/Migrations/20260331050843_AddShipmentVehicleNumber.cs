using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LogisticsTracking.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddShipmentVehicleNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "VehicleNumber",
                table: "Shipments",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "VehicleNumber",
                table: "Shipments");
        }
    }
}
