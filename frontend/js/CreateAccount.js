document.addEventListener("DOMContentLoaded", () => {
    const registerForm = document.getElementById("pane-register");

    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const emailInput = document.getElementById("reg-email").value;
        const usernameInput = document.getElementById("reg-username").value;
        const passwordInput = document.getElementById("reg-password").value;

        const userData = {
            email: emailInput,
            username: usernameInput,
            password: passwordInput
        };

        try {
            
            const response = await fetch("/api/auth/register", {
                method: "POST", // Tells the server that we are using post method which means creating data
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