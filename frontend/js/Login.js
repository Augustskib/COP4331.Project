document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("pane-login");
    const alertBox = document.getElementById("register-alert");

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const emailInput = document.getElementById("login-email").value;
        const passwordInput = document.getElementById("login-password").value;

        const userData = {
            email: emailInput,
            password: passwordInput
        };

        try {
            
            const response = await fetch("/api/auth/register", {
                method: "Get", // Tells the server that we are using get method which means reading data
                headers: {
                    "Content-Type": "application/json" // specifies the type of data being sent (json)
                },
                body: JSON.stringify(userData) // Converting our bundle into text for the trip
            });

            console.log("The fetch was sent and the API replied!");

        } catch (error) {
            // catches major network errors (like if your server is offline)
            console.error("The fetch failed entirely:", error);
        }
    })
})