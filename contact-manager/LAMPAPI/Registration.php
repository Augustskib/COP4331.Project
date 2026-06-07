<?php
        header("Access-Control-Allow-Origin: *");
        header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
                http_response_code(200);
                exit();
        }
        $inData = getRequestInfo();
        $conn = new mysqli("localhost", "TheBeast", "WeLoveCOP4331", "ContactManager");
        if ($conn->connect_error)
        {
                returnWithError($conn->connect_error);
        }
        else
        {
                $hashedPassword = md5($inData["password"]);
                $stmt = $conn->prepare("INSERT INTO Users (FirstName,LastName,Login,Password) VALUES(?,?,?,?)");
                $stmt->bind_param("ssss", $inData["firstName"], $inData["lastName"], $inData["login"], $hashedPassword);
                $stmt->execute();
                if ($stmt->affected_rows > 0)
                {
                        returnWithInfo($stmt->insert_id);
                }
                else
                {
                        returnWithError("Registration failed");
                }
                $stmt->close();
                $conn->close();
        }
        function getRequestInfo()
        {
                return json_decode(file_get_contents('php://input'), true);
        }
        function sendResultInfoAsJson($obj)
        {
                header('Content-type: application/json');
                echo $obj;
        }
        function returnWithError($err)
        {
                $retValue = '{"id":0,"error":"' . $err . '"}';
                sendResultInfoAsJson($retValue);
        }
        function returnWithInfo($id)
        {
                $retValue = '{"id":' . $id . ',"error":""}';
                sendResultInfoAsJson($retValue);
        }
?>
